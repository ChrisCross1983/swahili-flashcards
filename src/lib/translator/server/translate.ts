import type {
  TranslationDirection,
  TranslationLanguage,
  TranslationRequestDirection,
  TranslationResult,
} from "@/lib/translator/types";
import type { SupportedAudioFormat } from "@/lib/translator/audioFormats";
import {
  getTranslatorPipelineErrorCode,
  TranslatorPipelineError,
} from "@/lib/translator/server/errors";

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
};

export type AutoTranslationOutput =
  | {
      sourceLanguage: TranslationLanguage;
      targetLanguage: TranslationLanguage;
      translatedText: string;
    }
  | {
      sourceLanguage: "unknown";
      targetLanguage: null;
      translatedText: null;
    };

export type TranslatorAiGateway = {
  transcribe: (input: TranscriptionInput) => Promise<TranscriptionOutput>;
  autoTranslate: (text: string) => Promise<AutoTranslationOutput>;
  translate: (text: string, direction: TranslationDirection) => Promise<string>;
};

type TranslateRecordedAudioInput = {
  audio: Blob;
  format: SupportedAudioFormat;
  direction: TranslationRequestDirection;
};

function containsSpeechText(text: string) {
  return /[\p{L}\p{N}]/u.test(text);
}

export async function translateRecordedAudio(
  input: TranslateRecordedAudioInput,
  gateway: TranslatorAiGateway,
): Promise<TranslationResult> {
  const startedAt = Date.now();
  const transcriptionStartedAt = Date.now();
  let originalText: string;

  try {
    const bytes = new Uint8Array(await input.audio.arrayBuffer());
    const transcription = await gateway.transcribe({
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
    originalText = transcription.text.trim();
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

  const translationStartedAt = Date.now();
  const isAuto = input.direction.sourceLanguage === "auto";
  let result: TranslationResult;

  if (input.direction.sourceLanguage === "auto") {
    let autoResult: AutoTranslationOutput;
    try {
      autoResult = await gateway.autoTranslate(originalText);
    } catch {
      throw new TranslatorPipelineError(
        "translation_failed",
        "Automatic translation failed",
      );
    }
    if (autoResult.sourceLanguage === "unknown") {
      throw new TranslatorPipelineError(
        "unsupported_language",
        "Detected language is not supported",
      );
    }
    if (!autoResult.translatedText.trim()) {
      throw new TranslatorPipelineError(
        "translation_failed",
        "Automatic translation returned empty output",
      );
    }
    result = {
      originalText,
      translatedText: autoResult.translatedText.trim(),
      sourceLanguage: autoResult.sourceLanguage,
      targetLanguage: autoResult.targetLanguage,
    };
  } else {
    const direction: TranslationDirection = input.direction;
    let translatedText: string;
    try {
      translatedText = (
        await gateway.translate(originalText, direction)
      ).trim();
    } catch {
      throw new TranslatorPipelineError(
        "translation_failed",
        "Text translation failed",
      );
    }
    if (!translatedText) {
      throw new TranslatorPipelineError(
        "translation_failed",
        "Translation returned empty output",
      );
    }
    result = {
      originalText,
      translatedText,
      sourceLanguage: direction.sourceLanguage,
      targetLanguage: direction.targetLanguage,
    };
  }

  if (process.env.NODE_ENV === "development") {
    const translationDurationMs = Date.now() - translationStartedAt;
    console.info(
      "[translator] timings",
      isAuto
        ? {
            transcriptionMs,
            autoTranslateMs: translationDurationMs,
            totalMs: Date.now() - startedAt,
          }
        : {
            transcriptionMs,
            translationMs: translationDurationMs,
            totalMs: Date.now() - startedAt,
          },
    );
  }

  return result;
}
