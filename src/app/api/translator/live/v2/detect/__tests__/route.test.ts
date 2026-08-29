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

describe("POST /api/translator/live/v2/detect", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    detectMock.mockReset();
    requireUserMock.mockResolvedValue({ user: { id: "user-1" }, response: null });
  });

  it("classifies only the authoritative transcript and passes expected language as a hint", async () => {
    detectMock.mockResolvedValue("de");
    const response = await POST(new Request("http://local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authoritativeTranscript: "Das ist eindeutig Deutsch.",
        expectedLanguage: "sw",
      }),
    }));
    expect(response.status).toBe(200);
    expect(detectMock).toHaveBeenCalledWith(
      "Das ist eindeutig Deutsch.",
      process.env.OPENAI_API_KEY,
      "sw",
    );
    await expect(response.json()).resolves.toEqual({
      language: "de",
      classificationSource: "terra",
    });
  });

  it("does not classify an empty transcript", async () => {
    const response = await POST(new Request("http://local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authoritativeTranscript: "" }),
    }));
    expect(response.status).toBe(400);
    expect(detectMock).not.toHaveBeenCalled();
  });
});
