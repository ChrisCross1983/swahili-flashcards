import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslatorPipelineError } from "@/lib/translator/server/errors";

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

function request(withHeader = true, benchmarkModel?: string) {
  const formData = new FormData();
  formData.append("audio", new Blob([new Uint8Array(256)], { type: "audio/webm" }), "recording.webm");
  formData.append("sourceLanguage", "sw");
  formData.append("targetLanguage", "de");
  formData.append("recordingDurationMs", "1000");
  formData.append("chunkCount", "2");
  formData.append("totalChunkBytes", "256");
  if (benchmarkModel) formData.append("benchmarkModel", benchmarkModel);
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

  it("accepts allowlisted Whisper only as a direct internal benchmark model", async () => {
    transcribeMock.mockResolvedValueOnce({
      text: "Habari yako leo?", detectedLanguage: "sw",
      model: "whisper-1", fallbackUsed: false,
    });
    const { POST } = await import("../route");
    const response = await POST(request(true, "whisper-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      model: "whisper-1",
      fallbackUsed: false,
    });
    expect(transcribeMock).toHaveBeenCalledWith(expect.objectContaining({
      benchmarkModel: "whisper-1",
    }));
  });

  it("isolates an audio-STT failure as a benchmark 503", async () => {
    transcribeMock.mockRejectedValue(new Error("upstream"));
    const { POST } = await import("../route");
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "transcription_failed" });
  });

  it.each([
    ["gpt-transcribe", "model_not_found", "benchmark_model_unavailable"],
    ["gpt-4o-transcribe", "forbidden", "benchmark_model_unavailable"],
    ["gpt-transcribe", "upstream", "benchmark_model_transcription_failed"],
  ])("returns a sanitized %s failure for %s", async (model, message, expectedCode) => {
    transcribeMock.mockRejectedValue(new TranslatorPipelineError(
      message === "model_not_found" || message === "forbidden" ? "configuration" : "transcription_failed",
      message,
    ));
    const { POST } = await import("../route");
    const response = await POST(request(true, model));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: expectedCode,
      error: "Vergleich konnte nicht erstellt werden.",
    });
  });

  it("rejects an arbitrary benchmark model before invoking transcription", async () => {
    const { POST } = await import("../route");
    const response = await POST(request(true, "not-a-transcription-model"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ungültige Anfrage." });
    expect(transcribeMock).not.toHaveBeenCalled();
  });
});
