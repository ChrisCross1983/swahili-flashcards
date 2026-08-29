import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUserMock, translateMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  translateMock: vi.fn(),
}));
vi.mock("@/lib/api/auth", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/translator/server/openai", () => ({
  createOpenAITranslatorGateway: () => ({ translate: translateMock }),
}));

import { POST } from "../route";

describe("POST /api/translator/live/v2/translate", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    translateMock.mockReset();
    requireUserMock.mockResolvedValue({ user: { id: "user-1" }, response: null });
    translateMock.mockResolvedValue("Ningependa kukuonyesha kitu.");
  });

  it("translates the authoritative transcript with the strict Terra gateway", async () => {
    const response = await POST(new Request("http://local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authoritativeTranscript: "Ich möchte dir etwas zeigen.",
        sourceLanguage: "de",
        targetLanguage: "sw",
      }),
    }));
    expect(response.status).toBe(200);
    expect(translateMock).toHaveBeenCalledWith("Ich möchte dir etwas zeigen.", {
      sourceLanguage: "de",
      targetLanguage: "sw",
    });
    await expect(response.json()).resolves.toEqual({
      translatedText: "Ningependa kukuonyesha kitu.",
      translationModel: "gpt-5.6-terra",
    });
  });

  it("rejects an unsupported or same-language direction", async () => {
    const response = await POST(new Request("http://local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authoritativeTranscript: "Hallo",
        sourceLanguage: "de",
        targetLanguage: "de",
      }),
    }));
    expect(response.status).toBe(400);
    expect(translateMock).not.toHaveBeenCalled();
  });
});
