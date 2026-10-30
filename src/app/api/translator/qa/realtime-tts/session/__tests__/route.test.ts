import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUserMock, enabledMock } = vi.hoisted(() => ({ requireUserMock: vi.fn(), enabledMock: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/translator/realtimeTtsQa", async (original) => ({
  ...await original<typeof import("@/lib/translator/realtimeTtsQa")>(),
  realtimeTtsQaPreviewEnabled: enabledMock,
}));

import { POST } from "../route";

describe("preview-only realtime TTS secret route", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    requireUserMock.mockReset();
    enabledMock.mockReset();
    enabledMock.mockReturnValue(true);
    requireUserMock.mockResolvedValue({ user: { id: "user-1" }, response: null });
    process.env.OPENAI_API_KEY = "server-key";
  });

  it("is closed outside preview before auth or OpenAI", async () => {
    enabledMock.mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(new Request("https://test/session", { method: "POST", body: JSON.stringify({ language: "de" }) }))).status).toBe(404);
    expect(requireUserMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires auth and creates only a no-microphone realtime secret", async () => {
    const unauthorized = new Response("Unauthorized", { status: 401 });
    requireUserMock.mockResolvedValueOnce({ user: null, response: unauthorized });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: "ek_test" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await POST(new Request("https://test/session", { method: "POST", body: JSON.stringify({ language: "de" }) }))).toBe(unauthorized);
    expect(fetchMock).not.toHaveBeenCalled();

    const response = await POST(new Request("https://test/session", { method: "POST", body: JSON.stringify({ language: "de" }) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ clientSecret: "ek_test", model: "gpt-realtime-2.1-mini" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    const body = JSON.parse(String(init.body));
    expect(body.session.model).toBe("gpt-realtime-2.1-mini");
    expect(body.session.audio.input.turn_detection).toBeNull();
    expect(body.session.tools).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("translate");
    expect(JSON.stringify(body)).not.toContain("transcribe");
  });
  it.each([["de", 1], ["sw", 0.9]])("configures %s speed before any response", async (language, speed) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: "ek_test" })));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("https://test/session", { method: "POST", body: JSON.stringify({ language }) }));
    expect((await response.json()).configuredSpeechSpeed).toBe(speed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).session.audio.output.speed).toBe(speed);
  });

});
