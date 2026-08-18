import type {
  TranslationDirection,
  TranslationResult,
} from "@/lib/translator/types";
import type { SupportedAudioFormat } from "@/lib/translator/audioFormats";
import { TranslatorPipelineError } from "@/lib/translator/server/errors";

export type TranscriptionInput = {
  bytes: Uint8Array;
  fileName: string;
  extension: SupportedAudioFormat["extension"];
  originalMimeType: string;
  normalizedMimeType: string;
  language: TranslationDirection["sourceLanguage"];
};

export type TranslatorAiGateway = {
  transcribe: (input: TranscriptionInput) => Promise<string>;
  translate: (text: string, direction: TranslationDirection) => Promise<string>;
};

type TranslateRecordedAudioInput = {
  audio: Blob;
  format: SupportedAudioFormat;
  direction: TranslationDirection;
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
    originalText = (
      await gateway.transcribe({
        bytes,
        fileName: `recording.${input.format.extension}`,
        extension: input.format.extension,
        originalMimeType: input.audio.type,
        normalizedMimeType: input.format.mimeType,
        language: input.direction.sourceLanguage,
      })
    ).trim();
  } catch {
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
  let translatedText: string;
  try {
    translatedText = (
      await gateway.translate(originalText, input.direction)
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
    sourceLanguage: input.direction.sourceLanguage,
    targetLanguage: input.direction.targetLanguage,
  };
}
