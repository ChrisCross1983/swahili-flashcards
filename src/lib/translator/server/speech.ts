import type { TranslationLanguage } from "@/lib/translator/types";
import { TranslatorPipelineError } from "@/lib/translator/server/errors";

export const MAX_SPEECH_TEXT_LENGTH = 4_000;

export type TranslatorSpeechGateway = {
  synthesize: (
    text: string,
    language: TranslationLanguage,
    speed: number,
    signal?: AbortSignal,
  ) => Promise<Response>;
};

const SPEECH_INSTRUCTIONS = {
  sw: "Speak clearly, naturally and calmly in Tanzanian Kiswahili. Use a slightly slower conversational pace. Prioritize intelligibility and natural pronunciation. Do not separate syllables unnaturally.",
  de: "Speak clearly, naturally and calmly in German. Use a slightly slower conversational pace. Prioritize intelligibility and natural pronunciation. Do not separate syllables unnaturally.",
} as const;

export function getSpeechInstructions(language: TranslationLanguage) {
  return SPEECH_INSTRUCTIONS[language];
}

export async function generateTranslatorSpeech(
  text: string,
  language: TranslationLanguage,
  speed: number,
  gateway: TranslatorSpeechGateway,
  signal?: AbortSignal,
) {
  const startedAt = performance.now();
  let response: Response;

  try {
    response = await gateway.synthesize(text, language, speed, signal);
  } catch {
    throw new TranslatorPipelineError(
      "speech_failed",
      "Speech generation failed",
    );
  }

  if (!response.body) {
    throw new TranslatorPipelineError(
      "speech_failed",
      "Speech generation returned empty audio",
    );
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[translator] speech timing", {
      ttsUpstreamResponseHeadersMs: Math.round(performance.now() - startedAt),
    });
  }

  return response;
}
