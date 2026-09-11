import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const transcribeMock = vi.fn();
const translateMock = vi.fn();
const autoTranslateMock = vi.fn();

vi.mock("@/lib/api/auth", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/translator/capturePolicy", () => ({ INTERNAL_TRANSLATOR_QA_ENABLED: true }));
vi.mock("@/lib/translator/server/openai", () => ({
  createOpenAITranslatorGateway: () => ({
    transcribe: transcribeMock,
    translate: translateMock,
    autoTranslate: autoTranslateMock,
  }),
}));

function request(withHeader = true) {
  const formData = new FormData();
  formData.append("audio", new Blob([new Uint8Array(256)], { type: "audio/webm" }), "recording.webm");
  formData.append("sourceLanguage", "sw");
  formData.append("targetLanguage", "de");
  formData.append("recordingDurationMs", "1000");
  formData.append("chunkCount", "2");
  formData.append("totalChunkBytes", "256");
  return new Request("http://localhost/api/translator/transcribe", {
    method: "POST",
    headers: withHeader ? { "X-Translator-Request-Phase": "internal_benchmark" } : undefined,
    body: formData,
  });
}

describe("POST /api/translator/transcribe", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    requireUserMock.mockResolvedValue({ user: { id: "user-1" }, response: null });
    transcribeMock.mockReset();
    translateMock.mockReset();
    autoTranslateMock.mockReset();
    transcribeMock.mockResolvedValue({
      text: "Unaitwa nani?", detectedLanguage: "sw",
      model: "gpt-4o-mini-transcribe", fallbackUsed: false,
    });
  });

  it("requires the explicit internal benchmark phase", async () => {
    const { POST } = await import("../route");
    const response = await POST(request(false));
    expect(response.status).toBe(400);
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("returns only secondary transcription data and never translates", async () => {
    const { POST } = await import("../route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      transcript: "Unaitwa nani?", model: "gpt-4o-mini-transcribe",
      fallbackUsed: false, transcriptionMs: expect.any(Number), completedAt: expect.any(String),
    });
    expect(transcribeMock).toHaveBeenCalledOnce();
    expect(translateMock).not.toHaveBeenCalled();
    expect(autoTranslateMock).not.toHaveBeenCalled();
  });

  it("isolates an audio-STT failure as a benchmark 503", async () => {
    transcribeMock.mockRejectedValue(new Error("upstream"));
    const { POST } = await import("../route");
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "transcription_failed" });
  });
});
