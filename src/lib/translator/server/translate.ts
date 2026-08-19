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

export type TranslatorAiGateway = {
  transcribe: (input: TranscriptionInput) => Promise<TranscriptionOutput>;
  classifyLanguage: (text: string) => Promise<TranslationLanguage | null>;
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
  let detectedLanguage: TranslationLanguage | null;

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
    detectedLanguage = transcription.detectedLanguage;
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

  const sourceLanguage =
    input.direction.sourceLanguage === "auto"
      ? detectedLanguage ?? (await classifyFallbackLanguage(originalText, gateway))
      : input.direction.sourceLanguage;
  if (!sourceLanguage) {
    throw new TranslatorPipelineError(
      "unsupported_language",
      "Detected language is not supported",
    );
  }
  const direction: TranslationDirection = {
    sourceLanguage,
    targetLanguage: sourceLanguage === "de" ? "sw" : "de",
  };

  const translationStartedAt = Date.now();
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

  if (process.env.NODE_ENV === "development") {
    console.info("[translator] timings", {
      transcriptionMs,
      translationMs: Date.now() - translationStartedAt,
      totalMs: Date.now() - startedAt,
    });
  }

  return {
    originalText,
    translatedText,
    sourceLanguage: direction.sourceLanguage,
    targetLanguage: direction.targetLanguage,
  };
}

async function classifyFallbackLanguage(
  transcript: string,
  gateway: TranslatorAiGateway,
) {
  try {
    return await gateway.classifyLanguage(transcript);
  } catch {
    return null;
  }
}
