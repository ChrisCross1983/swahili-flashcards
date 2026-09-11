import type {
  TranslationDirection,
  TranslationDiagnostics,
  TranslationLanguage,
  TranslationRequestDirection,
  TranslationResult,
} from "@/lib/translator/types";
import type { SupportedAudioFormat } from "@/lib/translator/audioFormats";
import {
  getTranslatorPipelineErrorCode,
  TranslatorPipelineError,
} from "@/lib/translator/server/errors";
import { TRANSLATION_MODEL } from "@/lib/translator/server/models";
import {
  isEssenceSummaryEligible,
  validateEssenceSummary,
} from "@/lib/translator/essenceSummary";

export type TranscriptionInput = {
  bytes: Uint8Array;
  fileName: string;
  extension: SupportedAudioFormat["extension"];
  originalMimeType: string;
  normalizedMimeType: string;
  language: TranslationLanguage | null;
};

export type TranscriptionOutput = {
  text: string;
  detectedLanguage: TranslationLanguage | null;
  model: string;
  fallbackUsed: boolean;
};

export type AutoTranslationOutput =
  | {
      sourceLanguage: TranslationLanguage;
      targetLanguage: TranslationLanguage;
      translatedText: string;
      essenceSummary?: string | null;
    }
  | {
      sourceLanguage: "unknown";
      targetLanguage: null;
      translatedText: null;
      essenceSummary?: null;
    };

export type StructuredTranslationOutput = {
  translatedText: string;
  essenceSummary?: string | null;
};

export type TranslatorAiGateway = {
  transcribe: (input: TranscriptionInput) => Promise<TranscriptionOutput>;
  autoTranslate: (
    text: string,
    options?: { summaryEligible: boolean },
  ) => Promise<AutoTranslationOutput>;
  translate: (
    text: string,
    direction: TranslationDirection,
  ) => Promise<string>;
  translateWithSummary?: (
    text: string,
    direction: TranslationDirection,
  ) => Promise<StructuredTranslationOutput>;
};

type TranslateRecordedAudioInput = {
  audio: Blob;
  format: SupportedAudioFormat;
  direction: TranslationRequestDirection;
  recordingDurationMs?: number | null;
};

export type AudioTranscriptionResult = {
  transcript: string;
  model: string;
  fallbackUsed: boolean;
  transcriptionMs: number;
  completedAt: string;
};

type TranslateAuthoritativeTextInput = {
  authoritativeTranscript: string;
  direction: TranslationRequestDirection;
  transcriptionModel: string;
  transcriptionMs: number;
  recordingDurationMs?: number | null;
};

function containsSpeechText(text: string) {
  return /[\p{L}\p{N}]/u.test(text);
}

async function translateTranscript(
  originalText: string,
  direction: TranslationRequestDirection,
  transcriptionOutput: TranscriptionOutput,
  transcriptionMs: number,
  startedAt: number,
  gateway: TranslatorAiGateway,
  transcriptFinalAt?: string,
  recordingDurationMs?: number | null,
): Promise<TranslationResult> {
  const translationStartedAt = Date.now();
  const isAuto = direction.sourceLanguage === "auto";
  let result: Omit<TranslationResult, "diagnostics">;
  const summaryEligible = isEssenceSummaryEligible({
    text: originalText,
    recordingDurationMs,
  });
  let rawSummary: unknown = null;
  let summaryFallbackWithoutSummary = false;

  if (direction.sourceLanguage === "auto") {
    let autoResult: AutoTranslationOutput;
    try {
      autoResult = summaryEligible
        ? await gateway.autoTranslate(originalText, { summaryEligible: true })
        : await gateway.autoTranslate(originalText);
    } catch {
      throw new TranslatorPipelineError(
        "translation_failed",
        "Automatic translation failed",
        originalText,
      );
    }
    if (autoResult.sourceLanguage === "unknown") {
      throw new TranslatorPipelineError(
        "unsupported_language",
        "Detected language is not supported",
        originalText,
      );
    }
    if (!autoResult.translatedText.trim()) {
      throw new TranslatorPipelineError(
        "translation_failed",
        "Automatic translation returned empty output",
        originalText,
      );
    }
    result = {
      originalText,
      translatedText: autoResult.translatedText.trim(),
      sourceLanguage: autoResult.sourceLanguage,
      targetLanguage: autoResult.targetLanguage,
    };
    rawSummary = autoResult.essenceSummary;
  } else {
    const concreteDirection: TranslationDirection = direction;
    let translationOutput: string | StructuredTranslationOutput;
    try {
      if (summaryEligible && gateway.translateWithSummary) {
        translationOutput = await gateway.translateWithSummary(
          originalText,
          concreteDirection,
        );
      } else {
        summaryFallbackWithoutSummary = summaryEligible;
        translationOutput = await gateway.translate(originalText, concreteDirection);
      }
    } catch {
      throw new TranslatorPipelineError(
        "translation_failed",
        "Text translation failed",
        originalText,
      );
    }
    const translatedText = typeof translationOutput === "string"
      ? translationOutput.trim()
      : translationOutput.translatedText.trim();
    rawSummary = typeof translationOutput === "string"
      ? null
      : translationOutput.essenceSummary;
    if (!translatedText) {
      throw new TranslatorPipelineError(
        "translation_failed",
        "Translation returned empty output",
        originalText,
      );
    }
    result = {
      originalText,
      translatedText,
      sourceLanguage: concreteDirection.sourceLanguage,
      targetLanguage: concreteDirection.targetLanguage,
    };
  }

  const summaryValidation = summaryFallbackWithoutSummary
    ? {
        valid: false,
        summary: null,
        warningCount: 0,
        contradictionDetected: false,
        compressionRatio: null,
        outcome: "fallback_without_summary" as const,
      }
    : summaryEligible
    ? validateEssenceSummary({
        sourceText: originalText,
        translatedText: result.translatedText,
        summary: rawSummary,
      })
    : {
        valid: false,
        summary: null,
        warningCount: 0,
        contradictionDetected: false,
        compressionRatio: null,
        outcome: "not_eligible" as const,
      };
  if (summaryValidation.summary) result.essenceSummary = summaryValidation.summary;

  const translationReadyAt = Date.now();
  const translationDurationMs = translationReadyAt - translationStartedAt;
  const serverTranslationTotalMs = translationReadyAt - startedAt;
  const diagnostics: TranslationDiagnostics = {
    transcriptionModel: transcriptionOutput.model,
    translationModel: TRANSLATION_MODEL,
    transcriptionMs,
    ...(isAuto
      ? { autoTranslateMs: translationDurationMs }
      : { translationMs: translationDurationMs }),
    serverTranslationTotalMs,
    transcriptionFallbackUsed: transcriptionOutput.fallbackUsed,
    detectedLanguage: isAuto
      ? result.sourceLanguage
      : transcriptionOutput.detectedLanguage ?? result.sourceLanguage,
    ...(summaryEligible ? {
      summaryEligible: true,
      summaryGenerated: summaryValidation.valid,
      summaryLength: summaryValidation.summary?.length ?? 0,
      summaryCompressionRatio: summaryValidation.compressionRatio,
      summaryCriticalFactWarningCount: summaryValidation.warningCount,
      summaryContradictionDetected: summaryValidation.contradictionDetected,
      summaryGenerationOutcome: summaryValidation.outcome,
    } : {}),
    ...(transcriptFinalAt
      ? {
          transcriptFinalAt,
          translationStartedAt: new Date(translationStartedAt).toISOString(),
          translationReadyAt: new Date(translationReadyAt).toISOString(),
        }
      : {}),
  };

  if (process.env.NODE_ENV === "development") {
    console.info("[translator][turn performance][server]", {
      transcriptionModel: transcriptionOutput.model,
      transcriptionFallbackUsed: transcriptionOutput.fallbackUsed,
      transcriptionMs,
      ...(isAuto
        ? { autoTranslateMs: translationDurationMs }
        : { translationMs: translationDurationMs }),
      serverTranslationTotalMs,
    });
  }

  return { ...result, diagnostics };
}

export async function translateAuthoritativeText(
  input: TranslateAuthoritativeTextInput,
  gateway: TranslatorAiGateway,
): Promise<TranslationResult> {
  const startedAt = Date.now();
  const originalText = input.authoritativeTranscript.trim();
  if (!originalText || !containsSpeechText(originalText)) {
    throw new TranslatorPipelineError("no_speech", "No speech detected");
  }

  return translateTranscript(
    originalText,
    input.direction,
    {
      text: originalText,
      detectedLanguage:
        input.direction.sourceLanguage === "auto"
          ? null
          : input.direction.sourceLanguage,
      model: input.transcriptionModel,
      fallbackUsed: false,
    },
    input.transcriptionMs,
    startedAt,
    gateway,
    undefined,
    input.recordingDurationMs,
  );
}

export async function translateRecordedAudio(
  input: TranslateRecordedAudioInput,
  gateway: TranslatorAiGateway,
): Promise<TranslationResult> {
  const startedAt = Date.now();
  const transcriptionStartedAt = Date.now();
  let originalText: string;
  let transcriptionOutput: TranscriptionOutput;

  try {
    const bytes = new Uint8Array(await input.audio.arrayBuffer());
    transcriptionOutput = await gateway.transcribe({
      bytes,
      fileName: `recording.${input.format.extension}`,
      extension: input.format.extension,
      originalMimeType: input.audio.type,
      normalizedMimeType: input.format.mimeType,
      language:
        input.direction.sourceLanguage === "auto"
          ? null
          : input.direction.sourceLanguage,
    });
    originalText = transcriptionOutput.text.trim();
  } catch (error) {
    if (getTranslatorPipelineErrorCode(error) === "unsupported_language") {
      throw error;
    }
    throw new TranslatorPipelineError(
      "transcription_failed",
      "Audio transcription failed",
    );
  }

  const transcriptionMs = Date.now() - transcriptionStartedAt;
  if (!originalText || !containsSpeechText(originalText)) {
    throw new TranslatorPipelineError("no_speech", "No speech detected");
  }
  const transcriptFinalAt = new Date().toISOString();

  return translateTranscript(
    originalText,
    input.direction,
    transcriptionOutput,
    transcriptionMs,
    startedAt,
    gateway,
    transcriptFinalAt,
    input.recordingDurationMs,
  );
}

/** Uses the established safe audio-STT gateway without starting a translation. */
export async function transcribeRecordedAudio(
  input: Omit<TranslateRecordedAudioInput, "recordingDurationMs">,
  gateway: TranslatorAiGateway,
): Promise<AudioTranscriptionResult> {
  const startedAt = Date.now();
  let output: TranscriptionOutput;
  try {
    output = await gateway.transcribe({
      bytes: new Uint8Array(await input.audio.arrayBuffer()),
      fileName: `recording.${input.format.extension}`,
      extension: input.format.extension,
      originalMimeType: input.audio.type,
      normalizedMimeType: input.format.mimeType,
      language: input.direction.sourceLanguage === "auto"
        ? null
        : input.direction.sourceLanguage,
    });
  } catch (error) {
    if (getTranslatorPipelineErrorCode(error) === "unsupported_language") throw error;
    throw new TranslatorPipelineError("transcription_failed", "Audio transcription failed");
  }
  const transcript = output.text.trim();
  if (!transcript || !containsSpeechText(transcript)) {
    throw new TranslatorPipelineError("no_speech", "No speech detected");
  }
  return {
    transcript,
    model: output.model,
    fallbackUsed: output.fallbackUsed,
    transcriptionMs: Date.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
