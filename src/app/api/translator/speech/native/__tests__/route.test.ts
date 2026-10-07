import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const synthesizeMock = vi.fn();
vi.mock("@/lib/api/auth", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/translator/server/openai", () => ({
  createOpenAISpeechGateway: () => ({ synthesize: synthesizeMock }),
}));

const key = Buffer.alloc(32, 7).toString("base64");

async function stage(text = "Habari za asubuhi.") {
  const { POST } = await import("../route");
  return POST(new Request("http://localhost/api/translator/speech/native", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language: "sw", speed: 1 }),
  }));
}

function mediaRequest(url: string, cookie: string, headers?: HeadersInit) {
  return new Request(`http://localhost${url}`, { headers: { Cookie: cookie, ...headers } });
}

function context(url: string) {
  return { params: Promise.resolve({ mediaId: url.split("/").at(-1)! }) };
}

describe("native progressive TTS media contract", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "spike/native-progressive-tts-ios");
    vi.stubEnv("CLASSIC_NATIVE_TTS_COOKIE_KEY", key);
    requireUserMock.mockResolvedValue({ user: { id: "user-1" }, response: null });
    synthesizeMock.mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "audio/mpeg" },
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    requireUserMock.mockReset();
    synthesizeMock.mockReset();
  });

  it("hides the route in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await stage()).status).toBe(404);
    expect(requireUserMock).not.toHaveBeenCalled();
  });

  it("requires authentication before staging any media ticket", async () => {
    requireUserMock.mockResolvedValue({ user: null, response: Response.json({}, { status: 401 }) });
    const response = await stage();
    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(synthesizeMock).not.toHaveBeenCalled();
  });

  it("keeps exact text server-side and streams full MP3 with no fake range response", async () => {
    const text = "Habari kutoka Terra, bila kufupisha.";
    const staged = await stage(text);
    const { mediaUrl } = await staged.json();
    const cookie = staged.headers.get("Set-Cookie")!.split(";")[0];
    expect(mediaUrl).toMatch(/^\/api\/translator\/speech\/native\/[A-Za-z0-9_-]{24}\.mp3$/);
    expect(mediaUrl).not.toContain(text);
    expect(cookie).not.toContain(text);
    const { GET } = await import("../[mediaId]/route");
    const response = await GET(mediaRequest(mediaUrl, cookie, { Range: "bytes=0-" }), context(mediaUrl));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Accept-Ranges")).toBe("none");
    expect(response.headers.get("Content-Length")).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(synthesizeMock).toHaveBeenCalledWith(text, "sw", 1, expect.any(AbortSignal));
    const repeated = await GET(mediaRequest(mediaUrl, cookie), context(mediaUrl));
    expect(repeated.status).toBe(200);
    await repeated.arrayBuffer();
    expect(synthesizeMock).toHaveBeenCalledTimes(2);
  });

  it("rejects nonzero Safari range without generating audio", async () => {
    const staged = await stage();
    const { mediaUrl } = await staged.json();
    const cookie = staged.headers.get("Set-Cookie")!.split(";")[0];
    const { GET } = await import("../[mediaId]/route");
    const response = await GET(mediaRequest(mediaUrl, cookie, { Range: "bytes=100-" }), context(mediaUrl));
    expect(response.status).toBe(416);
    expect(synthesizeMock).not.toHaveBeenCalled();
  });

  it("returns the first MP3 bytes before upstream generation finishes", async () => {
    let finishStream!: () => void;
    synthesizeMock.mockImplementation(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        finishStream = () => {
          controller.enqueue(new Uint8Array([3, 4]));
          controller.close();
        };
      },
    }), { headers: { "Content-Type": "audio/mpeg" } }));
    const staged = await stage();
    const { mediaUrl } = await staged.json();
    const cookie = staged.headers.get("Set-Cookie")!.split(";")[0];
    const { GET } = await import("../[mediaId]/route");
    const response = await GET(mediaRequest(mediaUrl, cookie), context(mediaUrl));
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array([1, 2]));
    finishStream();
    expect((await reader.read()).value).toEqual(new Uint8Array([3, 4]));
    expect((await reader.read()).done).toBe(true);
  });

  it("rejects a wrong user or expired ticket", async () => {
    const staged = await stage();
    const { mediaUrl } = await staged.json();
    const cookie = staged.headers.get("Set-Cookie")!.split(";")[0];
    const { GET } = await import("../[mediaId]/route");
    requireUserMock.mockResolvedValue({ user: { id: "user-2" }, response: null });
    expect((await GET(mediaRequest(mediaUrl, cookie), context(mediaUrl))).status).toBe(404);
    requireUserMock.mockResolvedValue({ user: { id: "user-1" }, response: null });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 121_000);
    try { expect((await GET(mediaRequest(mediaUrl, cookie), context(mediaUrl))).status).toBe(404); }
    finally { vi.useRealTimers(); }
    expect(synthesizeMock).not.toHaveBeenCalled();
  });

  it("falls back when the encrypted cookie would exceed the browser limit", async () => {
    const response = await stage("x".repeat(3_000));
    expect(response.status).toBe(413);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});
