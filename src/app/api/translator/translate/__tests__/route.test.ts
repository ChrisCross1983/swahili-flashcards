import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TRANSLATION_AUDIO_BYTES } from "@/lib/translator/audioFormats";
import { TranslatorPipelineError } from "@/lib/translator/server/errors";

const requireUserMock = vi.fn();
const transcribeMock = vi.fn();
const autoTranslateMock = vi.fn();
const translateMock = vi.fn();
const createGatewayMock = vi.fn(
  (_client?: unknown, instrumentation?: {
    onPromptPreparationStarted?: () => void;
    onPromptPreparationCompleted?: () => void;
    onSchemaPreparationStarted?: () => void;
    onSchemaPreparationCompleted?: () => void;
    onTranslationRequestStarted?: () => void;
    onTranslationCompleted?: () => void;
  }) => ({
    transcribe: transcribeMock,
    autoTranslate: async (...args: unknown[]) => {
      instrumentation?.onPromptPreparationStarted?.();
      instrumentation?.onPromptPreparationCompleted?.();
      instrumentation?.onSchemaPreparationStarted?.();
      instrumentation?.onSchemaPreparationCompleted?.();
      instrumentation?.onTranslationRequestStarted?.();
      const result = await autoTranslateMock(...args);
      instrumentation?.onTranslationCompleted?.();
      return result;
    },
    translate: async (...args: unknown[]) => {
      instrumentation?.onPromptPreparationStarted?.();
      instrumentation?.onPromptPreparationCompleted?.();
      instrumentation?.onTranslationRequestStarted?.();
      const result = await translateMock(...args);
      instrumentation?.onTranslationCompleted?.();
      return result;
    },
  }),
);

vi.mock("@/lib/api/auth", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/lib/translator/server/openai", () => ({
  createOpenAITranslatorGateway: createGatewayMock,
}));

function createFormData(options?: {
  audio?: Blob | null;
  sourceLanguage?: string;
  targetLanguage?: string;
}) {
  const formData = new FormData();
  if (options?.audio !== null) {
    formData.append(
      "audio",
      options?.audio ?? new Blob(["audio"], { type: "audio/webm" }),
      "recording.webm",
    );
  }
  formData.append("sourceLanguage", options?.sourceLanguage ?? "sw");
  formData.append("targetLanguage", options?.targetLanguage ?? "de");
  return formData;
}

async function post(formData: FormData) {
  const { POST } = await import("../route");
  return POST(
    new Request("http://localhost/api/translator/translate", {
      method: "POST",
      body: formData,
    }),
  );
}

async function postJson(body: unknown) {
  const { POST } = await import("../route");
  return POST(
    new Request("http://localhost/api/translator/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Translator-Correlation-Id": "translation-turn-1",
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/translator/translate", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createGatewayMock.mockClear();
    transcribeMock.mockReset();
    autoTranslateMock.mockReset();
    translateMock.mockReset();
    requireUserMock.mockImplementation(async (instrumentation) => {
      instrumentation?.onClientPreparationStarted?.();
      instrumentation?.onClientPreparationCompleted?.();
      instrumentation?.onUserLookupStarted?.();
      instrumentation?.onUserLookupCompleted?.();
      return { user: { id: "user-1" }, response: null };
    });
    transcribeMock.mockResolvedValue({
      text: "Tutakuja kesho asubuhi.",
      detectedLanguage: "sw",
      model: "gpt-4o-mini-transcribe",
      fallbackUsed: false,
    });
    autoTranslateMock.mockResolvedValue({
      sourceLanguage: "sw",
      targetLanguage: "de",
      translatedText: "Wir kommen morgen früh.",
    });
    translateMock.mockResolvedValue("Wir kommen morgen früh.");
  });

  it("returns 401 before parsing an unauthenticated request", async () => {
    requireUserMock.mockResolvedValue({
      user: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await post(createFormData());

    expect(response.status).toBe(401);
    expect(createGatewayMock).not.toHaveBeenCalled();
  });

  it("rejects invalid language directions", async () => {
    const response = await post(
      createFormData({ sourceLanguage: "de", targetLanguage: "de" }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_direction",
    });
  });

  it("rejects requests without audio", async () => {
    const response = await post(createFormData({ audio: null }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_request",
    });
  });

  it("rejects unsupported audio formats", async () => {
    const response = await post(
      createFormData({ audio: new Blob(["audio"], { type: "audio/ogg" }) }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_audio_format",
    });
  });

  it("rejects audio larger than 25 MB", async () => {
    const response = await post(
      createFormData({
        audio: new Blob([new Uint8Array(MAX_TRANSLATION_AUDIO_BYTES + 1)], {
          type: "audio/webm",
        }),
      }),
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "audio_too_large",
    });
  });

  it("returns a controlled error for an empty transcript", async () => {
    transcribeMock.mockResolvedValue({
      text: " ... ",
      detectedLanguage: "sw",
      model: "gpt-4o-mini-transcribe",
      fallbackUsed: false,
    });
    const response = await post(createFormData());
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "no_speech",
      error: "Es wurde keine Sprache erkannt. Bitte versuche es erneut.",
    });
    expect(translateMock).not.toHaveBeenCalled();
    expect(autoTranslateMock).not.toHaveBeenCalled();
  });

  it("returns transcription and translation with safe diagnostics", async () => {
    const response = await post(createFormData());
    expect(response.status).toBe(200);
    expect(response.headers.get("Server-Timing")).toContain("app-pre");
    expect(response.headers.get("X-Translator-Translation-Timing")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      originalText: "Tutakuja kesho asubuhi.",
      translatedText: "Wir kommen morgen früh.",
      sourceLanguage: "sw",
      targetLanguage: "de",
      diagnostics: {
        transcriptionModel: "gpt-4o-mini-transcribe",
        translationModel: "gpt-5.6-terra",
        transcriptionMs: expect.any(Number),
        translationMs: expect.any(Number),
        serverTranslationTotalMs: expect.any(Number),
        transcriptionFallbackUsed: false,
        detectedLanguage: "sw",
        transcriptFinalAt: expect.any(String),
        translationStartedAt: expect.any(String),
        translationReadyAt: expect.any(String),
        translationRouteReceivedAt: expect.any(String),
        translationAuthStartedAt: expect.any(String),
        translationAuthCompletedAt: expect.any(String),
        translationAuthClientPreparationMs: expect.any(Number),
        translationAuthUserLookupMs: expect.any(Number),
        translationBodyReadMs: expect.any(Number),
        translationJsonParseMs: null,
        translationValidationMs: expect.any(Number),
        translationNormalizationMs: expect.any(Number),
        translationPromptPreparationMs: expect.any(Number),
        translationSchemaPreparationMs: null,
        translationOpenAiClientPreparationMs: expect.any(Number),
        translationOtherPreOpenAiMs: expect.any(Number),
      },
    });
    expect(transcribeMock).toHaveBeenCalledOnce();
    expect(translateMock).toHaveBeenCalledWith(
      "Tutakuja kesho asubuhi.",
      { sourceLanguage: "sw", targetLanguage: "de" },
    );
    expect(requireUserMock).toHaveBeenCalledOnce();
  });

  it("accepts AUTO and returns the detected concrete direction", async () => {
    const response = await post(
      createFormData({ sourceLanguage: "auto", targetLanguage: "auto" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sourceLanguage: "sw",
      targetLanguage: "de",
    });
    expect(transcribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: null }),
    );
    expect(autoTranslateMock).toHaveBeenCalledOnce();
    expect(translateMock).not.toHaveBeenCalled();
  });

  it("accepts realtime text, skips audio STT and calls Terra exactly once", async () => {
    const response = await postJson({
      authoritativeTranscript: "Habari yako?",
      sourceLanguage: "auto",
      targetLanguage: "auto",
      transcriptionMs: 950,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Translator-Correlation-Id")).toBe(
      "translation-turn-1",
    );
    await expect(response.json()).resolves.toMatchObject({
      originalText: "Habari yako?",
      sourceLanguage: "sw",
      targetLanguage: "de",
      diagnostics: {
        transcriptionModel: "gpt-live-transcribe",
        transcriptionMs: 950,
        translationModel: "gpt-5.6-terra",
        translationRequestCorrelationId: "translation-turn-1",
        translationJsonParseMs: expect.any(Number),
        translationSchemaPreparationMs: expect.any(Number),
      },
    });
    expect(transcribeMock).not.toHaveBeenCalled();
    expect(autoTranslateMock).toHaveBeenCalledOnce();
    expect(autoTranslateMock).toHaveBeenCalledWith("Habari yako?");
    expect(translateMock).not.toHaveBeenCalled();
  });

  it("rejects invalid realtime transcript timing without calling a model", async () => {
    const response = await postJson({
      authoritativeTranscript: "Habari yako?",
      sourceLanguage: "auto",
      targetLanguage: "auto",
      transcriptionMs: -1,
    });

    expect(response.status).toBe(400);
    expect(createGatewayMock).not.toHaveBeenCalled();
    expect(transcribeMock).not.toHaveBeenCalled();
    expect(autoTranslateMock).not.toHaveBeenCalled();
  });

  it("asks for manual selection when AUTO detects another language", async () => {
    transcribeMock.mockResolvedValue({
      text: "Hello there",
      detectedLanguage: null,
      model: "gpt-4o-mini-transcribe",
      fallbackUsed: false,
    });
    autoTranslateMock.mockResolvedValue({
      sourceLanguage: "unknown",
      targetLanguage: null,
      translatedText: null,
    });

    const response = await post(
      createFormData({ sourceLanguage: "auto", targetLanguage: "auto" }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: "unsupported_language",
      error:
        "Es wurde weder Deutsch noch Kiswahili erkannt. Bitte wähle die Sprache manuell.",
      recognizedTranscript: "Hello there",
    });
    expect(translateMock).not.toHaveBeenCalled();
    expect(autoTranslateMock).toHaveBeenCalledOnce();
  });

  it("returns the recognized transcript when translation fails after STT", async () => {
    transcribeMock.mockResolvedValue({
      text: "Nyumba hii ni kubwa.", detectedLanguage: "sw",
      model: "gpt-4o-mini-transcribe", fallbackUsed: false,
    });
    translateMock.mockRejectedValue(new Error("temporary upstream failure"));
    const response = await post(createFormData());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: "translation_failed",
      error: "Die Übersetzung konnte nicht erstellt werden.",
      recognizedTranscript: "Nyumba hii ni kubwa.",
    });
  });

  it("does not leak raw OpenAI errors", async () => {
    transcribeMock.mockRejectedValue(
      new Error("sk-secret request_id=req-private raw SDK error"),
    );
    const response = await post(createFormData());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      code: "transcription_failed",
      error: "Die Aufnahme konnte nicht verarbeitet werden.",
    });
    expect(JSON.stringify(body)).not.toContain("sk-secret");
    expect(JSON.stringify(body)).not.toContain("req-private");
  });

  it("returns a generic response when the API key is missing", async () => {
    createGatewayMock.mockImplementationOnce(() => {
      throw new TranslatorPipelineError(
        "configuration",
        "OPENAI_API_KEY is not configured",
      );
    });
    const response = await post(createFormData());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "service_unavailable",
      error: "Der Übersetzungsdienst ist nicht verfügbar.",
    });
    expect(JSON.stringify(body)).not.toContain("OPENAI_API_KEY");
  });
});
