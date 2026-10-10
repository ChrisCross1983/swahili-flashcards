/** Conservative two-asset speech selection; deployment-scoped in next.config.ts. */
export const FIRST_SENTENCE_FAST_TTS_FLAG =
  process.env.NEXT_PUBLIC_TRANSLATOR_FIRST_SENTENCE_FAST_TTS === "true";

export type TranslatorTtsQaMode = "segmented" | "legacy" | "default";

export function resolveTranslatorTtsQaMode(
  search: string,
  spikeEnabled = process.env.NEXT_PUBLIC_TRANSLATOR_TTS_QA_ENABLED === "true",
): TranslatorTtsQaMode {
  if (!spikeEnabled) return "default";
  const mode = new URLSearchParams(search).get("ttsMode");
  return mode === "segmented" || mode === "legacy" ? mode : "default";
}

export function translatorTtsQaLoginUrl(search: string): string {
  const mode = resolveTranslatorTtsQaMode(search);
  return mode === "default" ? "/login" : `/login?ttsMode=${mode}`;
}

export function translatorTtsQaAfterLoginUrl(search: string): string {
  const mode = resolveTranslatorTtsQaMode(search);
  return mode === "default" ? "/" : `/translator?ttsMode=${mode}`;
}

// Match the existing speech route's stricter application limit, not the model limit.
export const MAX_CLASSIC_SPEECH_TEXT_LENGTH = 4_000;

export type FirstSentenceSplit = { first: string; rest: string };
export type FirstSentenceEligibilityReason =
  | "eligible" | "text_too_long" | "no_clear_sentence_boundary"
  | "ambiguous_sentence_boundary" | "first_sentence_too_short"
  | "first_sentence_too_long" | "remainder_too_short" | "remainder_not_complete";

export function assessFirstSentenceForSpeech(text: string): {
  split: FirstSentenceSplit | null; reason: FirstSentenceEligibilityReason;
} {
  if (text.length > MAX_CLASSIC_SPEECH_TEXT_LENGTH) return { split: null, reason: "text_too_long" };
  // The observed 297/311-character variants both have a short first sentence
  // and a substantial remainder. No cliff at a total of 300 characters.
  // A single ordinary space and an uppercase next sentence are required.
  const boundary = /^([^.!?\n]+[.!?]) (?=[A-ZÄÖÜ])/u.exec(text);
  if (!boundary) return { split: null, reason: "no_clear_sentence_boundary" };
  const first = boundary[1];
  const rest = text.slice(first.length);
  if (/\b(?:dr|prof|mr|mrs|ms|st|etc|ca|usw)\.$/iu.test(first)) {
    return { split: null, reason: "ambiguous_sentence_boundary" };
  }
  if (first.length < 20) return { split: null, reason: "first_sentence_too_short" };
  if (first.length / text.length > 0.25) return { split: null, reason: "first_sentence_too_long" };
  // Keep a conservative useful remainder while tolerating normal translation
  // variation around the former 250-character remainder threshold.
  if (rest.length < 220) return { split: null, reason: "remainder_too_short" };
  if (!/[.!?]$/u.test(rest) || !/[.!?]/u.test(rest.slice(1))) {
    return { split: null, reason: "remainder_not_complete" };
  }
  return { split: { first, rest }, reason: "eligible" };
}

export function splitFirstSentenceForSpeech(text: string): FirstSentenceSplit | null {
  return assessFirstSentenceForSpeech(text).split;
}
