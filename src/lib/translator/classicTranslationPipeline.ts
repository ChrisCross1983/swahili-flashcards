import {
  requestAudioTranslation,
  requestTextTranslation,
  TranslatorClientError,
} from "@/lib/translator/client";
import type { ClassicRealtimeTranscriptionResult } from "@/lib/translator/classicRealtimeTranscription";
import type { TranslationRequestDirection, TranslationResult } from "@/lib/translator/types";
import { isUserAbort, TranslatorOperationError } from "@/lib/translator/reliability";
import type { RecordedAudioDiagnostics } from "@/lib/translator/recordedAudio";

export type SemanticRescueContext = {
  primaryTranscript: string;
  primaryModel: string;
  rescueTranscript: string | null;
  rescueModel: string | null;
  primaryFailure: TranslatorOperationError["failure"];
  rescueFailure: TranslatorOperationError["failure"] | null;
  primaryFailureToRescueStartMs: number;
  rescueTranscriptionMs: number | null;
  rescueTranscriptToTranslationReadyMs: number | null;
  semanticRescueTotalMs: number;
};

type Dependencies = {
  requestText?: typeof requestTextTranslation;
  requestAudio?: typeof requestAudioTranslation;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
};

function waitForRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Request aborted", "AbortError"));
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Request aborted", "AbortError"));
    }, { once: true });
  });
}

function isUnsupportedLanguage(error: unknown): error is TranslatorOperationError {
  return error instanceof TranslatorOperationError &&
    error.failure.apiErrorCode === "unsupported_language";
}

function metric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function notify<T>(callback: ((context: T) => void) | undefined, context: T) {
  try {
    callback?.(context);
  } catch {
    // Diagnostics/UI hooks must never change translation outcome.
  }
}

export async function requestClassicTranslation(
  input: {
    realtimeResult: ClassicRealtimeTranscriptionResult;
    transcriptionMs: number | undefined;
    getAudioBlob: () => Promise<Blob>;
    direction: TranslationRequestDirection;
    signal: AbortSignal;
    correlationId?: string;
    onResponseCompleted?: (now: number) => void;
    recordedAudioDiagnostics?: RecordedAudioDiagnostics;
    simulatePrimaryUnsupportedLanguage?: boolean;
    onSemanticRescueStarted?: (context: Pick<SemanticRescueContext, "primaryTranscript" | "primaryFailure">) => void;
    onSemanticRescueSucceeded?: (context: SemanticRescueContext) => void;
    onSemanticRescueFailed?: (context: SemanticRescueContext) => void;
    onRetry?: (context: {
      attempt: number;
      reason: string;
      failure: TranslatorOperationError["failure"];
    }) => void;
  },
  dependencies: Dependencies = {},
): Promise<TranslationResult> {
  const requestText = dependencies.requestText ?? requestTextTranslation;
  const requestAudio = dependencies.requestAudio ?? requestAudioTranslation;
  const wait = dependencies.wait ?? waitForRetry;
  const now = dependencies.now ?? (() => performance.now());

  const requestPrimary = async (requestAttempt: number) => {
    if (input.realtimeResult.ok && input.transcriptionMs !== undefined) {
      if (input.simulatePrimaryUnsupportedLanguage) {
        throw new TranslatorClientError({
          category: "VALIDATION",
          message: "Ich konnte die Sprache nicht sicher erkennen. Bitte sprich den Satz noch einmal.",
          healthStatus: "healthy",
          httpStatus: 422,
          apiErrorCode: "unsupported_language",
          retryable: false,
          retryAfterMs: null,
          authFailureType: null,
        }, input.realtimeResult.authoritativeTranscript);
      }
      return requestText(input.realtimeResult.authoritativeTranscript, input.direction, input.transcriptionMs, {
        signal: input.signal,
        correlationId: input.correlationId,
        onResponseCompleted: input.onResponseCompleted,
        requestAttempt,
        requestPhase: "primary",
      });
    }
    return requestAudio(await input.getAudioBlob(), input.direction, {
      signal: input.signal,
      correlationId: input.correlationId,
      onResponseCompleted: input.onResponseCompleted,
      requestAttempt,
      requestPhase: "primary",
      recordedAudioDiagnostics: input.recordedAudioDiagnostics,
    });
  };

  let primaryError: unknown;
  try {
    return await requestPrimary(0);
  } catch (error) {
    primaryError = error;
  }
  const primaryFailedAt = now();

  if (
    input.realtimeResult.ok &&
    input.transcriptionMs !== undefined &&
    !input.signal.aborted &&
    isUnsupportedLanguage(primaryError)
  ) {
    const rescueStartedAt = now();
    notify(input.onSemanticRescueStarted, {
      primaryTranscript: input.realtimeResult.authoritativeTranscript,
      primaryFailure: primaryError.failure,
    });
    try {
      // The audio client runs the existing V5.2 sanity check before fetch.
      // This call is intentionally not wrapped in generic HTTP retry.
      const rescueResult = await requestAudio(await input.getAudioBlob(), input.direction, {
        signal: input.signal,
        correlationId: input.correlationId,
        onResponseCompleted: input.onResponseCompleted,
        requestAttempt: 0,
        requestPhase: "semantic_rescue",
        recordedAudioDiagnostics: input.recordedAudioDiagnostics,
      });
      const context: SemanticRescueContext = {
        primaryTranscript: input.realtimeResult.authoritativeTranscript,
        primaryModel: "gpt-live-transcribe",
        rescueTranscript: rescueResult.originalText,
        rescueModel: rescueResult.diagnostics.transcriptionModel,
        primaryFailure: primaryError.failure,
        rescueFailure: null,
        primaryFailureToRescueStartMs: Math.max(0, rescueStartedAt - primaryFailedAt),
        rescueTranscriptionMs: metric(rescueResult.diagnostics.transcriptionMs),
        rescueTranscriptToTranslationReadyMs: metric(
          rescueResult.diagnostics.autoTranslateMs ?? rescueResult.diagnostics.translationMs,
        ),
        semanticRescueTotalMs: Math.max(0, now() - rescueStartedAt),
      };
      notify(input.onSemanticRescueSucceeded, context);
      return {
        ...rescueResult,
        diagnostics: {
          ...rescueResult.diagnostics,
          transcriptionPath: "audio_upload_fallback",
          fallbackReason: "unsupported_language",
          sttRoutingDecision: "audio_rescue_semantic_failure",
          primaryTranscript: context.primaryTranscript,
          primaryTranscriptionPath: "realtime",
          primaryTranscriptionModel: context.primaryModel,
          rescueTranscript: context.rescueTranscript,
          rescueTranscriptionPath: "audio_upload_fallback",
          rescueTranscriptionModel: context.rescueModel,
          finalTranscript: rescueResult.originalText,
          finalTranscriptionPath: "audio_upload_fallback",
          finalTranscriptionModel: rescueResult.diagnostics.transcriptionModel,
          primaryFailureToRescueStartMs: context.primaryFailureToRescueStartMs,
          rescueTranscriptionMs: context.rescueTranscriptionMs,
          rescueTranscriptToTranslationReadyMs: context.rescueTranscriptToTranslationReadyMs,
          semanticRescueTotalMs: context.semanticRescueTotalMs,
        },
      };
    } catch (rescueError) {
      notify(input.onSemanticRescueFailed, {
        primaryTranscript: input.realtimeResult.authoritativeTranscript,
        primaryModel: "gpt-live-transcribe",
        rescueTranscript: rescueError instanceof TranslatorClientError ? rescueError.recognizedTranscript : null,
        rescueModel: "gpt-4o-mini-transcribe",
        primaryFailure: primaryError.failure,
        rescueFailure: rescueError instanceof TranslatorOperationError ? rescueError.failure : null,
        primaryFailureToRescueStartMs: Math.max(0, rescueStartedAt - primaryFailedAt),
        rescueTranscriptionMs: null,
        rescueTranscriptToTranslationReadyMs: null,
        semanticRescueTotalMs: Math.max(0, now() - rescueStartedAt),
      });
      throw rescueError;
    }
  }

  if (isUserAbort(primaryError) || !(primaryError instanceof TranslatorOperationError) || !primaryError.failure.retryable) {
    throw primaryError;
  }
  const recognizedTranscript = primaryError instanceof TranslatorClientError
    ? primaryError.recognizedTranscript
    : null;
  notify(input.onRetry, {
    attempt: 1,
    reason: primaryError.failure.apiErrorCode ?? primaryError.failure.category,
    failure: primaryError.failure,
  });
  await wait(primaryError.failure.retryAfterMs ?? 0, input.signal);
  try {
    return await requestPrimary(1);
  } catch (retryError) {
    if (recognizedTranscript && retryError instanceof TranslatorClientError && !retryError.recognizedTranscript) {
      throw new TranslatorClientError(retryError.failure, recognizedTranscript);
    }
    throw retryError;
  }
}
