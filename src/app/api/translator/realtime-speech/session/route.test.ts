import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/lib/api/auth", () => ({ requireUser: requireUserMock }));

describe("POST /api/translator/realtime-speech/session", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    requireUserMock.mockResolvedValue({ user: { id: "user-1" }, response: null });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      value: "ephemeral-secret",
      expires_at: 1_700_000_000,
    }), { status: 200 }));
  });

  it("creates an authenticated short-lived realtime audio session with alloy", async () => {
    const { POST } = await import("./route");
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      clientSecret: "ephemeral-secret",
      expiresAt: 1_700_000_000,
      model: "gpt-realtime-2.1-mini",
      voice: "alloy",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/client_secrets",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      expires_after: { anchor: "created_at", seconds: 60 },
      session: {
        type: "realtime",
        model: "gpt-realtime-2.1-mini",
        output_modalities: ["audio"],
        audio: { output: { voice: "alloy" } },
      },
    });
  });

  it("does not issue a session for an unauthenticated request", async () => {
    requireUserMock.mockResolvedValue({
      user: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const { POST } = await import("./route");
    const response = await POST();
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
