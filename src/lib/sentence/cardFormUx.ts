import { normalizeForDuplicateComparison } from "@/lib/cards/duplicates";

type SentencePair = { german: string; swahili: string };

export type SentenceLanguageValidation = {
  pairKey: string;
  status: "checking" | "ok" | "likely_swapped" | "language_mismatch" | "unavailable";
};

export function sentencePairKey(german: string, swahili: string): string {
  return `${german.trim()}\u0000${swahili.trim()}`;
}

export function shouldCheckSentenceLanguages(isSentence: boolean, german: string, swahili: string): boolean {
  return isSentence && Boolean(german.trim() && swahili.trim());
}

export function languageBlocksSentenceSave(
  needsCheck: boolean,
  pairKey: string,
  validation: SentenceLanguageValidation | null,
): boolean {
  return needsCheck && (validation?.pairKey !== pairKey || validation.status !== "ok");
}

export function swapSentencePair(input: SentencePair): SentencePair {
  return { german: input.swahili, swahili: input.german };
}

export function sameSentencePair(input: SentencePair, existing: { german_text: string; swahili_text: string }): boolean {
  return normalizeForDuplicateComparison(input.german) === normalizeForDuplicateComparison(existing.german_text)
    && normalizeForDuplicateComparison(input.swahili) === normalizeForDuplicateComparison(existing.swahili_text);
}

export function sentenceExplanationErrorCopy(code: string | undefined): string {
  if (code === "invalid_input") return "Bitte prüfe die beiden Sätze und kürze zu lange Eingaben.";
  if (code === "invalid_explanation" || code === "schema_validation_failed" || code === "invalid_json_output" || code === "incomplete_output") {
    return "Die Erklärung war leider unvollständig. Bitte erstelle sie noch einmal.";
  }
  if (code === "rate_limited" || code === "provider_rate_limit") return "Bitte warte kurz und versuche es dann erneut.";
  return "Die KI ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.";
}

export function shouldShowGrammarTip(input: {
  isSentence: boolean;
  editingId: string | null;
  german: string;
  swahili: string;
  hasExplanation: boolean;
  tipSeen: boolean;
}): boolean {
  return input.isSentence && !input.editingId && Boolean(input.german.trim()) && Boolean(input.swahili.trim())
    && !input.hasExplanation && !input.tipSeen;
}

export function focusNextSentence(
  scrollContainer: Pick<HTMLDivElement, "scrollTo"> | null,
  germanField: Pick<HTMLTextAreaElement, "focus"> | null,
): void {
  scrollContainer?.scrollTo({ top: 0, behavior: "auto" });
  germanField?.focus({ preventScroll: true });
}
