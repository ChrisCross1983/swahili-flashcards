import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser: requireUserMock }));

import { POST } from "../route";

describe("POST /api/translator/live/session", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    vi.unstubAllGlobals();
    process.env.OPENAI_API_KEY = "server-only-test-key";
    requireUserMock.mockResolvedValue({ user: { id: "user-1" }, response: null });
  });

  it("requires an authenticated user", async () => {
    const unauthorized = new Response("unauthorized", { status: 401 });
    requireUserMock.mockResolvedValue({ user: null, response: unauthorized });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await POST()).toBe(unauthorized);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates two short-lived fixed-direction translation secrets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: "ek_sw", expires_at: 123 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: "ek_de", expires_at: 123 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.sessions).toEqual([
      { targetLanguage: "sw", clientSecret: "ek_sw", expiresAt: 123 },
      { targetLanguage: "de", clientSecret: "ek_de", expiresAt: 123 },
    ]);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const requests = fetchMock.mock.calls.map(([, init]) => ({
      headers: (init as RequestInit).headers as Record<string, string>,
      body: JSON.parse(String((init as RequestInit).body)),
    }));
    expect(requests.map((request) => request.body.session.audio.output.language)).toEqual([
      "sw",
      "de",
    ]);
    expect(requests[0].body.session.model).toBe("gpt-realtime-translate");
    expect(requests[0].body.session.audio.input.transcription.model).toBe(
      "gpt-realtime-whisper",
    );
    expect(requests[0].headers.Authorization).toBe("Bearer server-only-test-key");
    expect(requests[0].headers["OpenAI-Safety-Identifier"]).not.toContain("user-1");
  });

  it("returns a safe unavailable error without exposing the API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("provider details", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST();
    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("server-only-test-key");
    expect(body).not.toContain("provider details");
  });
});
