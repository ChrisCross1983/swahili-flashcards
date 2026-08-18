import type { TranslationLanguage } from "@/lib/translator/types";
import { TranslatorPipelineError } from "@/lib/translator/server/errors";

export const MAX_SPEECH_TEXT_LENGTH = 4_000;

export type TranslatorSpeechGateway = {
  synthesize: (
    text: string,
    language: TranslationLanguage,
  ) => Promise<ArrayBuffer>;
};

export function getSpeechInstructions(language: TranslationLanguage) {
  return language === "sw"
    ? "Speak clearly, naturally and calmly in Tanzanian Kiswahili. Use a slightly slower conversational pace. Prioritize intelligibility and natural pronunciation. Do not separate syllables unnaturally."
    : "Speak clearly, naturally and calmly in German. Use a slightly slower conversational pace. Prioritize intelligibility and natural pronunciation. Do not separate syllables unnaturally.";
}

export async function generateTranslatorSpeech(
  text: string,
  language: TranslationLanguage,
  gateway: TranslatorSpeechGateway,
) {
  const startedAt = Date.now();
  let audio: ArrayBuffer;

  try {
    audio = await gateway.synthesize(text, language);
  } catch {
    throw new TranslatorPipelineError(
      "speech_failed",
      "Speech generation failed",
    );
  }

  if (audio.byteLength === 0) {
    throw new TranslatorPipelineError(
      "speech_failed",
      "Speech generation returned empty audio",
    );
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[translator] speech timing", {
      ttsGenerationMs: Date.now() - startedAt,
    });
  }

  return audio;
}
