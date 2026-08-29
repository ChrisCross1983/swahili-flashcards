import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser: requireUserMock }));

import { POST } from "../route";

describe("POST /api/translator/live/v2/session", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    requireUserMock.mockResolvedValue({ user: { id: "user-1" }, response: null });
    process.env.OPENAI_API_KEY = "server-test-key";
    vi.unstubAllGlobals();
  });

  it("creates exactly one gpt-live-transcribe client secret with supported hints", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: "ephemeral-value", expires_at: 123 }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST();
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const request = JSON.parse(String((init as RequestInit).body));
    expect(request.session.type).toBe("transcription");
    expect(request.session.audio.input.turn_detection).toBeNull();
    expect(request.session.audio.input.transcription).toMatchObject({
      model: "gpt-live-transcribe",
      languages: ["de", "sw"],
    });
    expect(request.session.audio.input.transcription.keywords).toContain("ndiyo");
    expect(JSON.stringify(request)).not.toContain("gpt-realtime-translate");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer server-test-key",
    });
    expect(JSON.stringify(await response.json())).not.toContain("server-test-key");
  });

  it("requires authentication before contacting OpenAI", async () => {
    const unauthorized = new Response("unauthorized", { status: 401 });
    requireUserMock.mockResolvedValue({ user: null, response: unauthorized });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await POST()).toBe(unauthorized);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
