import { afterEach, describe, expect, it, vi } from "vitest";
import { requestClassicTranslation } from "@/lib/translator/classicTranslationPipeline";
import type { TranslationResult } from "@/lib/translator/types";
import { TranslatorOperationError } from "@/lib/translator/reliability";
import { TranslatorClientError } from "@/lib/translator/client";

const direction = { sourceLanguage: "auto", targetLanguage: "auto" } as const;
const result = {
  originalText: "Habari yako?",
  translatedText: "Wie geht es dir?",
  sourceLanguage: "sw",
  targetLanguage: "de",
  diagnostics: {
    transcriptionModel: "gpt-live-transcribe",
    translationModel: "gpt-5.6-terra",
    transcriptionMs: 900,
    autoTranslateMs: 300,
    serverTranslationTotalMs: 310,
    transcriptionFallbackUsed: false,
    detectedLanguage: "sw",
  },
} satisfies TranslationResult;

describe("classic post-stop translation path", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("never uploads or retries an invalid multi-second backup recording", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestClassicTranslation({
      realtimeResult: { ok: false, fallbackReason: "transcript_not_finalized" },
      transcriptionMs: undefined,
      getAudioBlob: vi.fn(async () =>
        new Blob(["12345"], { type: "audio/webm" })),
      recordedAudioDiagnostics: {
        recordingDurationMs: 4_000,
        chunkCount: 1,
        totalChunkBytes: 5,
      },
      direction,
      signal: new AbortController().signal,
      onRetry: vi.fn(),
    })).rejects.toMatchObject({
      failure: {
        apiErrorCode: "invalid_audio_capture",
        retryable: false,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries one safe 503 failure exactly once and then succeeds", async () => {
    const temporary = new TranslatorOperationError({
      category: "SERVICE_UNAVAILABLE", message: "temporary", healthStatus: "offline",
      httpStatus: 503, apiErrorCode: "service_unavailable", retryable: true,
      retryAfterMs: null, authFailureType: null,
    });
    const requestText = vi.fn()
      .mockRejectedValueOnce(temporary)
      .mockResolvedValueOnce(result);
    const onRetry = vi.fn();
    await expect(requestClassicTranslation({
      realtimeResult: { ok: true, authoritativeTranscript: "Habari yako?" },
      transcriptionMs: 900, getAudioBlob: vi.fn(), direction,
      signal: new AbortController().signal, onRetry,
    }, { requestText, wait: vi.fn(async () => undefined) })).resolves.toBe(result);
    expect(requestText).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not retry validation or auth failures", async () => {
    const invalid = new TranslatorOperationError({
      category: "VALIDATION", message: "invalid", healthStatus: "healthy",
      httpStatus: 400, apiErrorCode: "invalid_request", retryable: false,
      retryAfterMs: null, authFailureType: null,
    });
    const requestText = vi.fn(async () => { throw invalid; });
    await expect(requestClassicTranslation({
      realtimeResult: { ok: true, authoritativeTranscript: "Habari" },
      transcriptionMs: 900, getAudioBlob: vi.fn(), direction,
      signal: new AbortController().signal,
    }, { requestText })).rejects.toBe(invalid);
    expect(requestText).toHaveBeenCalledOnce();
  });

  it("keeps a completed STT transcript if the retry later fails before a response", async () => {
    const first = new TranslatorClientError({
      category: "SERVICE_UNAVAILABLE", message: "temporary", healthStatus: "degraded",
      httpStatus: 503, apiErrorCode: "translation_failed", retryable: true,
      retryAfterMs: null, authFailureType: null,
    }, "Nyumba hii ni kubwa.");
    const second = new TranslatorClientError({
      category: "NETWORK", message: "offline", healthStatus: "offline",
      httpStatus: null, apiErrorCode: "network_error", retryable: true,
      retryAfterMs: null, authFailureType: null,
    });
    const requestAudio = vi.fn().mockRejectedValueOnce(first).mockRejectedValueOnce(second);
    const request = requestClassicTranslation({
      realtimeResult: { ok: false, fallbackReason: "session_error" },
      transcriptionMs: undefined,
      getAudioBlob: vi.fn(async () => new Blob(["audio"])), direction,
      signal: new AbortController().signal,
    }, { requestAudio, wait: vi.fn(async () => undefined) });
    await request.catch((error) => {
      expect(error).toMatchObject({
        recognizedTranscript: "Nyumba hii ni kubwa.",
        failure: { category: "NETWORK" },
      });
    });
    expect(requestAudio).toHaveBeenCalledTimes(2);
  });

  it("uses realtime text and skips audio upload STT in the normal path", async () => {
    const requestText = vi.fn(async () => result);
    const requestAudio = vi.fn(async () => result);
    const getAudioBlob = vi.fn(async () => new Blob(["audio"]));

    await expect(
      requestClassicTranslation(
        {
          realtimeResult: {
            ok: true,
            authoritativeTranscript: "Habari yako?",
          },
          transcriptionMs: 900,
          getAudioBlob,
          direction,
          signal: new AbortController().signal,
          correlationId: "translation-turn-1",
        },
        { requestText, requestAudio },
      ),
    ).resolves.toBe(result);

    expect(requestText).toHaveBeenCalledOnce();
    expect(requestText).toHaveBeenCalledWith(
      "Habari yako?",
      direction,
      900,
      expect.objectContaining({ correlationId: "translation-turn-1" }),
    );
    expect(requestAudio).not.toHaveBeenCalled();
    expect(getAudioBlob).not.toHaveBeenCalled();
  });

  it.each([
    "connection_failure",
    "connection_timeout",
    "realtime_not_ready_at_recording_start",
    "connection_lost_during_recording",
    "empty_transcript",
    "transcript_not_finalized",
    "session_error",
    "transcript_timeout",
    "realtime_circuit_breaker",
    "realtime_disabled",
    "realtime_track_rebind_failed",
    "timeout",
  ] as const)("uses the preserved audio upload fallback for %s", async (fallbackReason) => {
    const fallbackResult = {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        transcriptionModel: "gpt-4o-mini-transcribe",
      },
    };
    const requestText = vi.fn(async () => result);
    const requestAudio = vi.fn(async () => fallbackResult);
    const audioBlob = new Blob(["audio"], { type: "audio/webm" });
    const getAudioBlob = vi.fn(async () => audioBlob);

    await expect(
      requestClassicTranslation(
        {
          realtimeResult: { ok: false, fallbackReason },
          transcriptionMs: undefined,
          getAudioBlob,
          direction,
          signal: new AbortController().signal,
        },
        { requestText, requestAudio },
      ),
    ).resolves.toBe(fallbackResult);

    expect(requestText).not.toHaveBeenCalled();
    expect(getAudioBlob).toHaveBeenCalledOnce();
    expect(requestAudio).toHaveBeenCalledOnce();
    expect(requestAudio).toHaveBeenCalledWith(
      audioBlob,
      direction,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
