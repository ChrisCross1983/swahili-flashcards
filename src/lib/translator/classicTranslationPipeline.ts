import {
  requestAudioTranslation,
  requestTextTranslation,
  TranslatorClientError,
} from "@/lib/translator/client";
import type { ClassicRealtimeTranscriptionResult } from "@/lib/translator/classicRealtimeTranscription";
import type {
  TranslationRequestDirection,
  TranslationResult,
} from "@/lib/translator/types";
import {
  isUserAbort,
  TranslatorOperationError,
} from "@/lib/translator/reliability";

type ClassicTranslationPipelineDependencies = {
  requestText?: typeof requestTextTranslation;
  requestAudio?: typeof requestAudioTranslation;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
};

function waitForRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Request aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Request aborted", "AbortError"));
    }, { once: true });
  });
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
    onRetry?: (context: {
      attempt: number;
      reason: string;
      failure: TranslatorOperationError["failure"];
    }) => void;
  },
  dependencies: ClassicTranslationPipelineDependencies = {},
): Promise<TranslationResult> {
  const request = async () => {
    if (input.realtimeResult.ok && input.transcriptionMs !== undefined) {
      return (dependencies.requestText ?? requestTextTranslation)(
        input.realtimeResult.authoritativeTranscript,
        input.direction,
        input.transcriptionMs,
        {
          signal: input.signal,
          correlationId: input.correlationId,
          onResponseCompleted: input.onResponseCompleted,
        },
      );
    }
    return (dependencies.requestAudio ?? requestAudioTranslation)(
      await input.getAudioBlob(),
      input.direction,
      {
        signal: input.signal,
        correlationId: input.correlationId,
        onResponseCompleted: input.onResponseCompleted,
      },
    );
  };

  try {
    return await request();
  } catch (error) {
    if (
      isUserAbort(error) ||
      !(error instanceof TranslatorOperationError) ||
      !error.failure.retryable
    ) {
      throw error;
    }
    const delayMs = error.failure.retryAfterMs ?? 0;
    const recognizedTranscript = error instanceof TranslatorClientError
      ? error.recognizedTranscript
      : null;
    input.onRetry?.({
      attempt: 1,
      reason: error.failure.apiErrorCode ?? error.failure.category,
      failure: error.failure,
    });
    await (dependencies.wait ?? waitForRetry)(delayMs, input.signal);
    try {
      return await request();
    } catch (retryError) {
      if (
        recognizedTranscript &&
        retryError instanceof TranslatorClientError &&
        !retryError.recognizedTranscript
      ) {
        throw new TranslatorClientError(retryError.failure, recognizedTranscript);
      }
      throw retryError;
    }
  }
}
