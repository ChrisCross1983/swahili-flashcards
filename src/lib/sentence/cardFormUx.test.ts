import { describe, expect, it, vi } from "vitest";
import { focusNextSentence, languageBlocksSentenceSave, sameSentencePair, sentenceExplanationErrorCopy, sentencePairKey, shouldCheckSentenceLanguages, shouldShowGrammarTip, swapSentencePair } from "./cardFormUx";

describe("sentence card form decisions", () => {
  const pair = { german: "Was bedeutet das?", swahili: "Hilo linamaanisha nini?" };

  it("matches only the same normalized pair", () => {
    expect(sameSentencePair(pair, { german_text: "  WAS  bedeutet das? ", swahili_text: "HILO  linamaanisha  nini?" })).toBe(true);
    expect(sameSentencePair(pair, { german_text: "Was bedeutet das heute?", swahili_text: pair.swahili })).toBe(false);
    expect(sameSentencePair(pair, { german_text: pair.swahili, swahili_text: pair.german })).toBe(false);
  });

  it("swaps both language values without changing their content", () => {
    expect(swapSentencePair({ german: "Ninakuja kesho.", swahili: "Ich komme morgen." })).toEqual({ german: "Ich komme morgen.", swahili: "Ninakuja kesho." });
  });

  it("blocks only a current unresolved or confirmed mismatch and clears after correction", () => {
    const reversed = sentencePairKey("Ninakuja kesho.", "Ich komme morgen.");
    const corrected = sentencePairKey("Ich komme morgen.", "Ninakuja kesho.");
    expect(languageBlocksSentenceSave(false, corrected, null)).toBe(false);
    expect(languageBlocksSentenceSave(true, reversed, null)).toBe(true);
    expect(languageBlocksSentenceSave(true, reversed, { pairKey: reversed, status: "checking" })).toBe(true);
    expect(languageBlocksSentenceSave(true, reversed, { pairKey: reversed, status: "likely_swapped" })).toBe(true);
    expect(languageBlocksSentenceSave(true, reversed, { pairKey: reversed, status: "language_mismatch" })).toBe(true);
    expect(languageBlocksSentenceSave(true, reversed, { pairKey: reversed, status: "unavailable" })).toBe(true);
    expect(languageBlocksSentenceSave(true, corrected, { pairKey: reversed, status: "ok" })).toBe(true);
    expect(languageBlocksSentenceSave(true, corrected, { pairKey: corrected, status: "ok" })).toBe(false);
  });

  it("requires a current server result for every complete pair, independently of grammar", () => {
    for (const input of [
      { german: "Habari za asubuhi", swahili: "Guten Morgen" },
      { german: "Guten Morgen", swahili: "Habari za asubuhi" },
    ]) {
      const key = sentencePairKey(input.german, input.swahili);
      expect(shouldCheckSentenceLanguages(true, input.german, input.swahili)).toBe(true);
      expect(languageBlocksSentenceSave(true, key, null)).toBe(true);
      expect(languageBlocksSentenceSave(true, key, { pairKey: key, status: "ok" })).toBe(false);
    }
    expect(shouldCheckSentenceLanguages(true, "Guten Morgen", "")).toBe(false);
    expect(shouldCheckSentenceLanguages(false, "Guten Morgen", "Habari za asubuhi")).toBe(false);
  });

  it("maps provider and incomplete-output errors to distinct safe user copy", () => {
    expect(sentenceExplanationErrorCopy("schema_validation_failed")).toBe("Die Erklärung war leider unvollständig. Bitte erstelle sie noch einmal.");
    expect(sentenceExplanationErrorCopy("invalid_explanation")).toBe(sentenceExplanationErrorCopy("schema_validation_failed"));
    expect(sentenceExplanationErrorCopy("invalid_input")).toBe("Bitte prüfe die beiden Sätze und kürze zu lange Eingaben.");
    expect(sentenceExplanationErrorCopy("provider_auth")).toBe("Die KI ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.");
    expect(sentenceExplanationErrorCopy("network")).toBe(sentenceExplanationErrorCopy("provider_auth"));
  });

  it("offers the grammar tip only for a new complete sentence until acknowledged or used", () => {
    const base = { isSentence: true, editingId: null, ...pair, hasExplanation: false, tipSeen: false };
    expect(shouldShowGrammarTip(base)).toBe(true);
    expect(shouldShowGrammarTip({ ...base, german: "" })).toBe(false);
    expect(shouldShowGrammarTip({ ...base, swahili: "" })).toBe(false);
    expect(shouldShowGrammarTip({ ...base, editingId: "card-1" })).toBe(false);
    expect(shouldShowGrammarTip({ ...base, hasExplanation: true })).toBe(false);
    expect(shouldShowGrammarTip({ ...base, tipSeen: true })).toBe(false);
    expect(shouldShowGrammarTip({ ...base, isSentence: false })).toBe(false);
  });

  it("returns the new-sentence view to the top and the German input", () => {
    const scrollTo = vi.fn();
    const focus = vi.fn();
    focusNextSentence({ scrollTo }, { focus });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollTo.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]);
  });
});
