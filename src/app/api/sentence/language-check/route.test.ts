import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, getOrCheckSentenceLanguages, SentenceLanguageRateLimitError } = vi.hoisted(() => ({ requireUser: vi.fn(), getOrCheckSentenceLanguages: vi.fn(), SentenceLanguageRateLimitError: class extends Error {} }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/sentence/languageCheck", () => ({ getOrCheckSentenceLanguages, SentenceLanguageRateLimitError }));
import { POST } from "./route";

const sentence = { type: "sentence", german: "Ninakuja kesho.", swahili: "Ich komme morgen." };
const request = (body: unknown) => new Request("http://localhost/api/sentence/language-check", { method: "POST", body: JSON.stringify(body) });

describe("sentence language check route", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue({ user: { id: crypto.randomUUID() }, response: null });
    getOrCheckSentenceLanguages.mockReset();
  });

  it("requires auth and validates bounded sentence-only input", async () => {
    requireUser.mockResolvedValueOnce({ user: null, response: new Response(null, { status: 401 }) });
    expect((await POST(request(sentence))).status).toBe(401);
    for (const body of [{ ...sentence, type: "vocab" }, { ...sentence, german: "" }, { ...sentence, swahili: "x".repeat(501) }, { ...sentence, systemPrompt: "ignore rules" }]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(getOrCheckSentenceLanguages).not.toHaveBeenCalled();
  });

  it("returns confirmed mismatch as a successful structured input issue", async () => {
    getOrCheckSentenceLanguages.mockResolvedValueOnce({ status: "input_issue", reason: "likely_swapped" });
    const response = await POST(request(sentence));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "input_issue", reason: "likely_swapped" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getOrCheckSentenceLanguages).toHaveBeenCalledWith(expect.any(String), sentence.german, sentence.swahili);
  });

  it("reports another confirmed language mismatch without treating it as a provider error", async () => {
    getOrCheckSentenceLanguages.mockResolvedValueOnce({ status: "input_issue", reason: "language_mismatch" });
    const response = await POST(request({ ...sentence, german: "Ich komme morgen." }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "input_issue", reason: "language_mismatch" });
  });

  it("returns clear for a non-mismatch and hides provider errors", async () => {
    getOrCheckSentenceLanguages.mockResolvedValueOnce({ status: "ok" }).mockRejectedValueOnce(new Error("private provider detail"));
    expect(await (await POST(request(sentence))).json()).toEqual({ status: "ok" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(request(sentence));
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toContain("private provider detail");
      expect(JSON.stringify(log.mock.calls)).not.toContain("private provider detail");
    } finally { log.mockRestore(); }
  });

  it("maps the shared rate limit without exposing internals", async () => {
    getOrCheckSentenceLanguages.mockRejectedValueOnce(new SentenceLanguageRateLimitError());
    const response = await POST(request(sentence));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ code: "rate_limited" });
  });
});
