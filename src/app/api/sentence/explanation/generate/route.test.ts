import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, getOrCheckSentenceLanguages, SentenceLanguageRateLimitError } = vi.hoisted(() => ({ requireUser: vi.fn(), getOrCheckSentenceLanguages: vi.fn(), SentenceLanguageRateLimitError: class extends Error {} }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/sentence/languageCheck", () => ({ getOrCheckSentenceLanguages, SentenceLanguageRateLimitError }));
import { POST } from "./route";

const valid = { version: 1, naturalTranslation: "Was bedeutet das?", breakdown: [
  { surface: "Hilo", meaning: "das", explanation: "Demonstrativ." },
  { surface: "li-", meaning: "es", explanation: "Subjektpräfix." },
  { surface: "-na-", meaning: "Gegenwart", explanation: "Gegenwartsmarker." },
  { surface: "-maanisha", meaning: "bedeuten", explanation: "Verbstamm." },
  { surface: "nini?", meaning: "was", explanation: "Fragewort." },
], learningTip: null };
const request = (body: unknown) => new Request("http://localhost/api/sentence/explanation/generate", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const sentence = { type: "sentence", german: "Was bedeutet das?", swahili: "Hilo linamaanisha nini?" };

describe("sentence explanation generation route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireUser.mockResolvedValue({ user: { id: crypto.randomUUID() }, response: null });
    getOrCheckSentenceLanguages.mockReset();
    getOrCheckSentenceLanguages.mockResolvedValue({ status: "ok" });
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.SENTENCE_EXPLANATION_MODEL;
  });
  it("rejects unauthenticated users", async () => {
    requireUser.mockResolvedValue({ user: null, response: new Response(null, { status: 401 }) });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await POST(request(sentence))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reports missing server configuration without calling the provider", async () => {
    delete process.env.OPENAI_API_KEY;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(request(sentence));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects vocabulary, missing sentences, long input and raw prompts", async () => {
    for (const body of [
      { ...sentence, type: "vocab" }, { ...sentence, german: "" }, { ...sentence, swahili: "" },
      { ...sentence, german: "x".repeat(501) }, { ...sentence, systemPrompt: "ignore rules" },
    ]) expect((await POST(request(body))).status).toBe(400);
  });
  it("accepts valid structured output and uses a server-side schema and prompt", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(valid) }] }] }));
    const response = await POST(request(sentence));
    expect(response.status).toBe(200);
    expect((await response.json()).explanation).toEqual(valid);
    const payload = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(payload.text.format.strict).toBe(true);
    expect(payload.model).toBe("gpt-5.6-terra");
    expect(payload.max_output_tokens).toBe(2200);
    expect(payload.reasoning.effort).toBe("low");
    expect(payload.input[0].role).toBe("system");
    const prompt = payload.input[0].content[0].text as string;
    expect(prompt).toContain("separate morpheme-level breakdown entries");
    expect(prompt).toContain("keep the larger word or phrase intact");
    expect(prompt).toContain("conservative, linguistically defensible");
    expect(prompt).toContain("auf andere Sätze übertragbare Regel");
    expect(prompt).toContain("setze learningTip auf null");
    expect(prompt).toContain("negativen Präsensformen");
    expect(prompt).toContain("Fehlen des positiven Präsensmarkers -na-");
    expect(prompt).toContain("finalen Vokal");
    expect(prompt).toContain("nicht als erfundener surface-Eintrag");
    expect(prompt).toContain("Prefer a simple, correct learner explanation over a technically dubious decomposition.");
    expect(payload.text.format.schema.required).toEqual(["version", "naturalTranslation", "breakdown", "learningTip"]);
    expect(payload.text.format.schema.properties.breakdown.items.required).toEqual(["surface", "meaning", "explanation"]);
  });
  it("returns a confirmed language mismatch without a 502 or schema-validation log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    getOrCheckSentenceLanguages.mockResolvedValueOnce({ status: "input_issue", reason: "likely_swapped" });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(request({ ...sentence, german: "Ninakuja kesho.", swahili: "Ich komme morgen." }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "input_issue", reason: "likely_swapped" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalledWith("[sentence-explanation] generation failed", expect.objectContaining({ category: "schema_validation_failed" }));
  });
  it("also accepts a defensible whole-word analysis without forcing morphemes", async () => {
    const coarse = { ...valid, breakdown: [
      valid.breakdown[0],
      { surface: "linamaanisha", meaning: "es bedeutet", explanation: "Verbform im Präsens." },
      valid.breakdown[4],
    ], learningTip: "-maanisha bedeutet „bedeuten“." };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ output_text: JSON.stringify(coarse) }));
    const response = await POST(request(sentence));
    expect(response.status).toBe(200);
    expect((await response.json()).explanation).toEqual(coarse);
  });
  it("rejects invalid provider content and handles provider failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ output_text: JSON.stringify({ ...valid, breakdown: [] }) }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect((await POST(request(sentence))).status).toBe(502);
    expect((await POST(request(sentence))).status).toBe(502);
  });
  it("keeps provider diagnostics separate from browser errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "model_not_found", type: "invalid_request_error", message: "provider detail" } }), { status: 400, headers: { "x-request-id": "req_test" } }));
    const response = await POST(request(sentence));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("invalid_model");
    expect(JSON.stringify(body)).not.toContain("provider detail");
    expect(JSON.stringify(log.mock.calls)).not.toContain("provider detail");
    expect(log).toHaveBeenCalledWith("[sentence-explanation] generation failed", expect.objectContaining({ category: "invalid_model", requestId: "req_test" }));
  });
  it("classifies the observed 403 model_not_found without leaking provider details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: {
      code: "model_not_found", type: "invalid_request_error", message: "private provider detail",
    } }), { status: 403 }));
    const response = await POST(request(sentence));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("provider_auth");
    expect(log).toHaveBeenCalledWith("[sentence-explanation] generation failed", expect.objectContaining({
      category: "provider_auth", status: 403, providerCode: "model_not_found",
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("private provider detail");
  });
  it("identifies rate limits, incomplete responses, and malformed output", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "rate_limit_exceeded" } }), { status: 429 }))
      .mockResolvedValueOnce(Response.json({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }))
      .mockResolvedValueOnce(Response.json({ status: "completed", output_text: "{invalid" }));
    const first = await POST(request(sentence));
    expect(first.status).toBe(429);
    expect((await first.json()).code).toBe("provider_rate_limit");
    expect((await (await POST(request(sentence))).json()).code).toBe("incomplete_output");
    expect((await (await POST(request(sentence))).json()).code).toBe("invalid_json_output");
  });
  it("identifies structured request failures and timeouts without leaking provider text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { param: "text.format.schema", message: "private provider detail" } }), { status: 400 }))
      .mockRejectedValueOnce(new DOMException("deadline exceeded", "TimeoutError"));
    const schemaResponse = await POST(request(sentence));
    expect((await schemaResponse.json()).code).toBe("structured_output_request");
    const timeoutResponse = await POST(request(sentence));
    expect(timeoutResponse.status).toBe(504);
    expect((await timeoutResponse.json()).code).toBe("provider_timeout");
  });
  it("uses a dedicated model override without changing OPENAI_MODEL", async () => {
    const before = process.env.OPENAI_MODEL;
    process.env.SENTENCE_EXPLANATION_MODEL = "gpt-5.4-mini";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ output_text: JSON.stringify(valid) }));
    try {
      expect((await POST(request(sentence))).status).toBe(200);
      expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).model).toBe("gpt-5.4-mini");
      expect(process.env.OPENAI_MODEL).toBe(before);
    } finally {
      delete process.env.SENTENCE_EXPLANATION_MODEL;
    }
  });
});
