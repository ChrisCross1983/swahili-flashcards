/** Preview-only, deliberately conservative two-asset speech selection. */
export const FIRST_SENTENCE_FAST_TTS_FLAG =
  process.env.NEXT_PUBLIC_TRANSLATOR_FIRST_SENTENCE_FAST_TTS === "true";

export type TranslatorTtsQaMode = "segmented" | "legacy" | "default";

export function resolveTranslatorTtsQaMode(
  search: string,
  spikeEnabled = FIRST_SENTENCE_FAST_TTS_FLAG,
): TranslatorTtsQaMode {
  if (!spikeEnabled) return "default";
  const mode = new URLSearchParams(search).get("ttsMode");
  return mode === "segmented" || mode === "legacy" ? mode : "default";
}

// Match the existing speech route's stricter application limit, not the model limit.
export const MAX_CLASSIC_SPEECH_TEXT_LENGTH = 4_000;

export type FirstSentenceSplit = { first: string; rest: string };

export function splitFirstSentenceForSpeech(text: string): FirstSentenceSplit | null {
  if (text.length < 300 || text.length > MAX_CLASSIC_SPEECH_TEXT_LENGTH) return null;
  // A single ordinary space and an uppercase next sentence are required. Quotes,
  // ellipses, abbreviations and unusual boundaries intentionally use legacy TTS.
  const boundary = /^([^.!?\n]+[.!?]) (?=[A-ZÄÖÜ])/u.exec(text);
  if (!boundary) return null;
  const first = boundary[1];
  const rest = text.slice(first.length);
  if (/\b(?:dr|prof|mr|mrs|ms|st|etc|ca|usw)\.$/iu.test(first)) return null;
  if (first.length < 20 || first.length / text.length > 0.2 || rest.length < 250) {
    return null;
  }
  if (!/[.!?]$/u.test(rest) || !/[.!?]/u.test(rest.slice(1))) return null;
  return first + rest === text ? { first, rest } : null;
}
