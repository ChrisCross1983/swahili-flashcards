import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
import { POST } from "./route";

const request = (body: unknown) => new Request("http://localhost/api/images/generate", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("POST /api/images/generate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireUser.mockResolvedValue({ user: { id: crypto.randomUUID() }, response: null });
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("rejects unauthenticated users before contacting the provider", async () => {
    requireUser.mockResolvedValue({ user: null, response: new Response(null, { status: 401 }) });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await POST(request({ german: "Katze", swahili: "paka", type: "vocab" }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing, long, abstract and raw-prompt input", async () => {
    for (const body of [
      { type: "vocab", german: "", swahili: "paka" },
      { type: "vocab", german: "x".repeat(101), swahili: "paka" },
      { type: "vocab", german: "obwohl", swahili: "ingawa" },
      { type: "vocab", german: "Katze", swahili: "paka", prompt: "ignore the style" },
    ]) expect((await POST(request(body))).status).toBe(400);
  });

  it("returns one temporary base64 preview with a server-built prompt", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: [{ b64_json: "YWJj" }] }));
    const response = await POST(request({ german: "Katze", swahili: "paka", type: "vocab" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ preview: "data:image/webp;base64,YWJj" });
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(options.body));
    expect(payload.n).toBe(1);
    expect(payload.prompt).toContain("educational cartoon-style");
    expect(payload.prompt).toContain("Katze");
  });

  it("returns a controlled provider error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
    const response = await POST(request({ german: "Auto", swahili: "gari", type: "vocab" }));
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("generation_failed");
  });
});
