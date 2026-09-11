export const ESSENCE_SUMMARY_MIN_WORDS = 45;
export const ESSENCE_SUMMARY_MIN_RECORDING_DURATION_MS = 25_000;
export const ESSENCE_SUMMARY_MAX_CHARACTERS = 1_200;
export const ESSENCE_SUMMARY_MAX_COMPRESSION_RATIO = 0.65;

export type SummaryGenerationOutcome =
  | "success"
  | "not_eligible"
  | "not_meaningful"
  | "missing"
  | "invalid"
  | "insufficient_compression"
  | "critical_fact_guard_rejected"
  | "fallback_without_summary";

export type CriticalFactCategory =
  | "numbers"
  | "money"
  | "dates"
  | "times"
  | "names"
  | "places"
  | "negation";

function words(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean);
}

export function isEssenceSummaryEligible(input: {
  text: string;
  recordingDurationMs?: number | null;
}) {
  return words(input.text).length >= ESSENCE_SUMMARY_MIN_WORDS ||
    (typeof input.recordingDurationMs === "number" &&
      input.recordingDurationMs >= ESSENCE_SUMMARY_MIN_RECORDING_DURATION_MS);
}

function normalizedNumber(value: string) {
  return value.replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", ".");
}

function numberTokens(text: string) {
  return Array.from(text.matchAll(/\b\d[\d.,]*\b/gu), (match) =>
    normalizedNumber(match[0]));
}

export function detectCriticalFactCategories(text: string): CriticalFactCategory[] {
  const categories = new Set<CriticalFactCategory>();
  if (/\d/u.test(text)) categories.add("numbers");
  if (/(?:TZS|TSh|Sh(?:ilingi)?|Euro|EUR|€|Dollar|USD|\$)/iu.test(text)) {
    categories.add("money");
  }
  if (/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b|\b(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/iu.test(text)) {
    categories.add("dates");
  }
  if (/\b\d{1,2}(?::|\.)\d{2}\s*(?:Uhr|h)?\b/iu.test(text)) {
    categories.add("times");
  }
  if (/\b(?:nicht|nie|kein(?:e|en|er|es)?|si|sio|ha(?:ta)?|hakuna|kamwe)\b/iu.test(text)) {
    categories.add("negation");
  }
  return [...categories];
}

export function detectMoneyContradiction(text: string) {
  const tokens = Array.from(text.matchAll(
    /(?:\b\d[\d.,]*\s*(?:TZS|TSh|Sh(?:ilingi)?|Euro|EUR|€|Dollar|USD|\$))|(?:(?:TZS|TSh|Sh(?:ilingi)?|Euro|EUR|€|Dollar|USD|\$)\s*\d[\d.,]*)/giu,
  )).flatMap((match) => numberTokens(match[0]));
  return new Set(tokens).size > 1;
}

/**
 * Conservative local guard around the model-produced enhancement. It never
 * rewrites a summary: unsupported critical facts make the optional summary
 * disappear while the complete translation remains usable.
 */
export function validateEssenceSummary(input: {
  sourceText: string;
  translatedText: string;
  summary: unknown;
}) {
  const contradictionDetected = detectMoneyContradiction(input.sourceText);
  if (input.summary === null) {
    return {
      valid: false,
      summary: null,
      warningCount: 0,
      contradictionDetected,
      compressionRatio: null,
      outcome: "not_meaningful" as const,
    };
  }
  if (typeof input.summary !== "string") {
    return {
      valid: false,
      summary: null,
      warningCount: 0,
      contradictionDetected,
      compressionRatio: null,
      outcome: "missing" as const,
    };
  }
  const summary = input.summary.trim();
  if (!summary || summary.length > ESSENCE_SUMMARY_MAX_CHARACTERS) {
    return {
      valid: false,
      summary: null,
      warningCount: 0,
      contradictionDetected,
      compressionRatio: null,
      outcome: summary ? "invalid" as const : "missing" as const,
    };
  }
  const sourceNumbers = new Set(numberTokens(input.sourceText));
  const summaryNumbers = new Set(numberTokens(summary));
  const inventedNumbers = [...summaryNumbers].filter((value) =>
    !sourceNumbers.has(value));
  const selectedOneContradictoryValue = contradictionDetected &&
    sourceNumbers.size > 1 &&
    [...sourceNumbers].filter((value) => summaryNumbers.has(value)).length === 1;
  const warningCount = inventedNumbers.length +
    (selectedOneContradictoryValue ? 1 : 0);
  const normalizedTranslationLength = input.translatedText.replace(/\s+/gu, " ").trim().length;
  const normalizedSummaryLength = summary.replace(/\s+/gu, " ").trim().length;
  const compressionRatio = normalizedTranslationLength > 0
    ? Number((normalizedSummaryLength / normalizedTranslationLength).toFixed(4))
    : null;
  const insufficientCompression = compressionRatio !== null &&
    compressionRatio > ESSENCE_SUMMARY_MAX_COMPRESSION_RATIO;
  return {
    valid: warningCount === 0 && !insufficientCompression,
    summary: warningCount === 0 && !insufficientCompression ? summary : null,
    warningCount,
    contradictionDetected,
    compressionRatio,
    outcome: warningCount > 0
      ? "critical_fact_guard_rejected" as const
      : insufficientCompression
        ? "insufficient_compression" as const
        : "success" as const,
  };
}
