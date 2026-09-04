import { describe, expect, it, vi } from "vitest";
import {
  createTranslationEntry,
  requestAudioTranslation,
  requestTextTranslation,
} from "@/lib/translator/client";
import {
  initialTranslatorState,
  translatorReducer,
} from "@/lib/translator/stateMachine";

const direction = { sourceLanguage: "sw", targetLanguage: "de" } as const;
const result = {
  originalText: "Tutakuja kesho asubuhi.",
  translatedText: "Wir kommen morgen früh.",
  ...direction,
  diagnostics: {
    transcriptionModel: "gpt-4o-mini-transcribe",
    translationModel: "gpt-5.6-terra",
    transcriptionMs: 1200,
    translationMs: 800,
    serverTranslationTotalMs: 2000,
    transcriptionFallbackUsed: false,
    detectedLanguage: "sw" as const,
  },
};

describe("translator client", () => {
  it("sends the recorded file and uses the real API response", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const formData = init?.body as FormData;
      const audio = formData.get("audio") as File;
      expect(audio.name).toBe("recording.webm");
      expect(audio.type).toBe("audio/webm;codecs=opus");
      expect(formData.get("sourceLanguage")).toBe("sw");
      expect(formData.get("targetLanguage")).toBe("de");
      return Response.json(result);
    });

    await expect(
      requestAudioTranslation(
        new Blob([new Uint8Array(256)], { type: "audio/webm;codecs=opus" }),
        direction,
        { fetcher },
      ),
    ).resolves.toMatchObject(result);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sends an authoritative realtime transcript without an audio upload", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        "Content-Type": "application/json",
        "X-Translator-Correlation-Id": "translation-turn-1",
        "X-Translator-Request-Attempt": "0",
        "X-Translator-Request-Phase": "primary",
      });
      expect(init?.body).toBe(
        JSON.stringify({
          authoritativeTranscript: "Tutakuja kesho asubuhi.",
          sourceLanguage: "sw",
          targetLanguage: "de",
          transcriptionMs: 1850,
        }),
      );
      expect(init?.body).not.toBeInstanceOf(FormData);
      return Response.json(result);
    });

    await expect(
      requestTextTranslation(
        "Tutakuja kesho asubuhi.",
        direction,
        1850,
        { fetcher, correlationId: "translation-turn-1" },
      ),
    ).resolves.toMatchObject({
      ...result,
      diagnostics: {
        ...result.diagnostics,
        translationClientRequestStartedAt: expect.any(String),
        translationClientResponseFirstByteAt: expect.any(String),
        translationClientResponseCompletedAt: expect.any(String),
        translationRequestCorrelationId: "translation-turn-1",
      },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("creates a TranslationEntry and stores it through the processing transition", () => {
    const entry = createTranslationEntry(result, {
      timestamp: 123,
      id: "translation-123",
    });
    const processing = {
      ...initialTranslatorState,
      status: "processing" as const,
    };
    const complete = translatorReducer(processing, {
      type: "PROCESSING_SUCCEEDED",
      entry,
    });

    expect(complete.status).toBe("idle");
    expect(complete.entries).toEqual([entry]);
    expect(entry.diagnostics).toMatchObject({
      transcriptionModel: "gpt-4o-mini-transcribe",
      translationModel: "gpt-5.6-terra",
      transcriptionFallbackUsed: false,
    });
  });

  it("accepts a concrete detected direction for an AUTO request", async () => {
    const autoResult = {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        translationMs: undefined,
        autoTranslateMs: 800,
      },
    };
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const formData = init?.body as FormData;
      expect(formData.get("sourceLanguage")).toBe("auto");
      expect(formData.get("targetLanguage")).toBe("auto");
      return Response.json(autoResult);
    });

    await expect(
      requestAudioTranslation(
        new Blob([new Uint8Array(256)], { type: "audio/webm" }),
        { sourceLanguage: "auto", targetLanguage: "auto" },
        { fetcher },
      ),
    ).resolves.toMatchObject({
      sourceLanguage: "sw",
      targetLanguage: "de",
      diagnostics: {
        autoTranslateMs: 800,
      },
    });
  });

  it("maps API failures to the translator error state", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { code: "transcription_failed", error: "internal detail" },
        { status: 502 },
      ),
    );

    await expect(
      requestAudioTranslation(
        new Blob([new Uint8Array(256)], { type: "audio/webm" }),
        direction,
        { fetcher },
      ),
    ).rejects.toThrow("Die Aufnahme konnte nicht verarbeitet werden.");

    const processing = {
      ...initialTranslatorState,
      status: "processing" as const,
    };
    expect(
      translatorReducer(processing, {
        type: "PROCESSING_FAILED",
        message: "Die Aufnahme konnte nicht verarbeitet werden.",
      }),
    ).toMatchObject({ status: "idle" });
  });

  it("preserves a completed STT transcript when translation fails afterwards", async () => {
    const request = requestAudioTranslation(
      new Blob([new Uint8Array(256)], { type: "audio/webm" }),
      direction,
      { fetcher: vi.fn(async () => Response.json({
        code: "translation_failed",
        error: "generic",
        recognizedTranscript: "Nyumba hii ni kubwa.",
      }, { status: 502 })) },
    );
    await request.catch((error) => {
      expect(error).toMatchObject({
        recognizedTranscript: "Nyumba hii ni kubwa.",
        failure: { category: "SERVICE_UNAVAILABLE" },
      });
    });
  });

  it("preserves a client abort while reading a translation response", async () => {
    const abortError = new DOMException("request stopped", "AbortError");
    const fetcher = vi.fn(async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(abortError);
          },
        }),
      ),
    );

    await expect(
      requestTextTranslation("Habari", direction, 100, { fetcher }),
    ).rejects.toBe(abortError);
  });

  it("does not upload or retry an obviously invalid recorded blob", async () => {
    const fetcher = vi.fn();

    await expect(requestAudioTranslation(
      new Blob(["12345"], { type: "audio/webm" }),
      direction,
      {
        fetcher,
        recordedAudioDiagnostics: {
          recordingDurationMs: 4_000,
          chunkCount: 1,
          totalChunkBytes: 5,
        },
      },
    )).rejects.toMatchObject({
      failure: {
        category: "RECORDER",
        apiErrorCode: "invalid_audio_capture",
        retryable: false,
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("distinguishes recoverable auth network errors from expired sessions", async () => {
    const networkRequest = requestTextTranslation("Habari", direction, 100, {
      fetcher: vi.fn(async () => Response.json({
        code: "auth_required", authFailureType: "auth_network_error",
      }, { status: 401 })),
    });
    await networkRequest.catch((error) => {
      expect(error).toMatchObject({ failure: {
        category: "NETWORK", healthStatus: "offline", retryable: true,
        authFailureType: "auth_network_error",
      } });
    });

    const expiredRequest = requestTextTranslation("Habari", direction, 100, {
      fetcher: vi.fn(async () => Response.json({
        code: "auth_required", authFailureType: "invalid_session",
      }, { status: 401 })),
    });
    await expiredRequest.catch((error) => {
      expect(error).toMatchObject({ failure: {
        category: "AUTH", healthStatus: "auth_required", retryable: false,
        authFailureType: "invalid_session",
      } });
    });
  });
});
