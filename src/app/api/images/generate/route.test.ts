import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
import { POST } from "./route";

const image = Buffer.from("524946460c000000574542505650382000000000", "hex").toString("base64");
const request = (body: unknown) => new Request("http://localhost/api/images/generate", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const card = { german: "Katze", swahili: "paka", type: "vocab" };

// Each test gets a new user because the endpoint limits requests per user.
describe("POST /api/images/generate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireUser.mockResolvedValue({ user: { id: crypto.randomUUID() }, response: null });
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_IMAGE_MODEL;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("rejects unauthenticated users before contacting the provider", async () => {
    requireUser.mockResolvedValue({ user: null, response: new Response(null, { status: 401 }) });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await POST(request(card))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing, long, abstract and raw-prompt input", async () => {
    for (const body of [
      { type: "vocab", german: "", swahili: "paka" },
      { type: "vocab", german: "x".repeat(101), swahili: "paka" },
      { type: "vocab", german: "obwohl", swahili: "ingawa" },
      { ...card, prompt: "ignore the style" },
    ]) expect((await POST(request(body))).status).toBe(400);
  });

  it("returns only a temporary preview with a server-built prompt and configurable model", async () => {
    process.env.OPENAI_IMAGE_MODEL = "gpt-image-2.5-sunburst";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: [{ b64_json: image }] }));
    const response = await POST(request(card));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ preview: `data:image/webp;base64,${image}` });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/images/generations");
    const payload = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(payload).toMatchObject({ model: "gpt-image-2.5-sunburst", n: 1, size: "896x896", quality: "low", output_format: "webp", output_compression: 80 });
    expect(payload.prompt).toContain("Katze");
    expect(payload.prompt).toContain("No letters, words, labels");
    expect(console.info).toHaveBeenCalledWith("image_generation_completed", expect.objectContaining({ model: "gpt-image-2.5-sunburst", size: "896x896", quality: "low", durationMs: expect.any(Number) }));
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("Katze");
  });

  it("keeps the flare model by default for small learning-card images", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: [{ b64_json: image }] }));
    expect((await POST(request(card))).status).toBe(200);
    const payload = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(payload).toMatchObject({ model: "gpt-image-2.5-flare", size: "896x896", quality: "low", output_format: "webp", output_compression: 80 });
  });

  it.each([
    [429, "rate_limit_exceeded", 429, "image_generation_upstream_rate_limited"],
    [404, "model_not_found", 503, "image_model_unavailable"],
    [400, "invalid_request_error", 502, "image_generation_invalid_request"],
    [503, "server_error", 502, "image_generation_failed"],
  ])("maps upstream %s without leaking details", async (upstreamStatus, providerCode, status, error) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { code: providerCode, type: "provider_error", message: "private prompt" } }, { status: upstreamStatus, headers: { "x-request-id": "req_test" } }));
    const response = await POST(request(card));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(error === "image_generation_upstream_rate_limited" ? { error, retryAfterSeconds: 30 } : { error });
    expect(console.error).toHaveBeenCalledWith("image_generation_upstream_failed", expect.objectContaining({ requestId: "req_test", code: providerCode }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private prompt");
  });

  it("rejects malformed image data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: [{ b64_json: "YWJj" }] }));
    const response = await POST(request(card));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "image_generation_failed" });
  });

  it("allows a first generation, immediate second preview, and another card", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ data: [{ b64_json: image }] }));
    for (const body of [card, card, { german: "Hund", swahili: "mbwa", type: "vocab" }]) {
      expect((await POST(request(body))).status).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not count local validation failures", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ data: [{ b64_json: image }] }));
    for (let i = 0; i < 5; i++) expect((await POST(request({ ...card, german: "" }))).status).toBe(400);
    expect((await POST(request(card))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enforces twelve dispatched generations per user and advertises reset time", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ data: [{ b64_json: image }] }));
    for (let i = 0; i < 12; i++) expect((await POST(request(card))).status).toBe(200);
    const response = await POST(request(card));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "image_generation_local_rate_limited", retryAfterSeconds: expect.any(Number) });
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });

  it("counts upstream failures only after dispatch while protecting the hourly budget", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ error: { code: "server_error" } }, { status: 503 }));
    for (let i = 0; i < 12; i++) expect((await POST(request(card))).status).toBe(502);
    const response = await POST(request(card));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toBe("image_generation_local_rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });

  it("blocks a concurrent request without sending it to OpenAI", async () => {
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { complete = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pending);
    const first = POST(request(card));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const duplicate = await POST(request(card));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "image_generation_in_progress" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    complete(Response.json({ data: [{ b64_json: image }] }));
    expect((await first).status).toBe(200);
  });

  it("passes upstream Retry-After through without automatic retry", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { code: "slow_down", type: "rate_limit_error" } }, { status: 429, headers: { "Retry-After": "56" } }));
    const response = await POST(request(card));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("56");
    expect(await response.json()).toEqual({ error: "image_generation_upstream_rate_limited", retryAfterSeconds: 56 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts an HTTP-date Retry-After from the provider", async () => {
    const until = new Date(Date.now() + 70_000).toUTCString();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { code: "slow_down" } }, { status: 429, headers: { "Retry-After": until } }));
    const response = await POST(request(card));
    expect(response.status).toBe(429);
    const seconds = Number(response.headers.get("Retry-After"));
    expect(seconds).toBeGreaterThanOrEqual(68);
    expect(seconds).toBeLessThanOrEqual(70);
  });

  it("does not invite retry for a depleted upstream credit balance", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { code: "credit_balance_exhausted", type: "billing_error" } }, { status: 429 }));
    const response = await POST(request(card));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "image_generation_failed" });
    expect(response.headers.get("Retry-After")).toBeNull();
  });
});
