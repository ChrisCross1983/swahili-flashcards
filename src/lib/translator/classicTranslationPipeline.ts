import {
  requestAudioTranslation,
  requestTextTranslation,
} from "@/lib/translator/client";
import type { ClassicRealtimeTranscriptionResult } from "@/lib/translator/classicRealtimeTranscription";
import type {
  TranslationRequestDirection,
  TranslationResult,
} from "@/lib/translator/types";

type ClassicTranslationPipelineDependencies = {
  requestText?: typeof requestTextTranslation;
  requestAudio?: typeof requestAudioTranslation;
};

export async function requestClassicTranslation(
  input: {
    realtimeResult: ClassicRealtimeTranscriptionResult;
    transcriptionMs: number | undefined;
    getAudioBlob: () => Promise<Blob>;
    direction: TranslationRequestDirection;
    signal: AbortSignal;
  },
  dependencies: ClassicTranslationPipelineDependencies = {},
): Promise<TranslationResult> {
  if (input.realtimeResult.ok && input.transcriptionMs !== undefined) {
    return (dependencies.requestText ?? requestTextTranslation)(
      input.realtimeResult.authoritativeTranscript,
      input.direction,
      input.transcriptionMs,
      { signal: input.signal },
    );
  }

  return (dependencies.requestAudio ?? requestAudioTranslation)(
    await input.getAudioBlob(),
    input.direction,
    { signal: input.signal },
  );
}
