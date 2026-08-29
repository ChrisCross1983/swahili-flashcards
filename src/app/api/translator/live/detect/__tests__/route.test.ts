import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUserMock, detectMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  detectMock: vi.fn(),
}));
vi.mock("@/lib/api/auth", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/translator/live/server/languageDetector", () => ({
  detectLiveLanguageOnServer: detectMock,
}));

import { POST } from "../route";

describe("POST /api/translator/live/detect", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    detectMock.mockReset();
    requireUserMock.mockResolvedValue({ user: { id: "user-1" }, response: null });
  });

  it("requires authentication", async () => {
    const unauthorized = new Response(null, { status: 401 });
    requireUserMock.mockResolvedValue({ user: null, response: unauthorized });
    expect(await POST(new Request("http://local", { method: "POST" }))).toBe(unauthorized);
    expect(detectMock).not.toHaveBeenCalled();
  });

  it("returns only the detected language label", async () => {
    detectMock.mockResolvedValue("sw");
    const response = await POST(new Request("http://local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Nataka kwenda hospitali." }),
    }));
    expect(await response.json()).toEqual({ language: "sw" });
    expect(detectMock).toHaveBeenCalledWith("Nataka kwenda hospitali.");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects invalid or oversized transcripts", async () => {
    const response = await POST(new Request("http://local", {
      method: "POST",
      body: JSON.stringify({ text: "x".repeat(5_001) }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      language: "unknown",
      code: "transcript_too_long",
      reason: "transcript_exceeds_limit",
    });
    expect(detectMock).not.toHaveBeenCalled();
  });

  it("returns a safe reason for the empty transcript that caused the beta 400s", async () => {
    const response = await POST(new Request("http://local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnId: "turn-empty", text: "" }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      language: "unknown",
      code: "empty_transcript",
      reason: "transcript_is_empty",
    });
    expect(detectMock).not.toHaveBeenCalled();
  });
});
