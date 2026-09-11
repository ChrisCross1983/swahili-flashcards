import { describe, expect, it } from "vitest";
import {
  ESSENCE_SUMMARY_MAX_COMPRESSION_RATIO,
  ESSENCE_SUMMARY_MIN_RECORDING_DURATION_MS,
  ESSENCE_SUMMARY_MIN_WORDS,
  isEssenceSummaryEligible,
  validateEssenceSummary,
} from "@/lib/translator/essenceSummary";

describe("classic essence summary policy", () => {
  it("does not summarize a short everyday turn", () => {
    expect(isEssenceSummaryEligible({ text: "Wie viel kostet es?" })).toBe(false);
  });

  it("uses named word and duration thresholds", () => {
    expect(isEssenceSummaryEligible({
      text: Array.from({ length: ESSENCE_SUMMARY_MIN_WORDS }, () => "neno").join(" "),
    })).toBe(true);
    expect(isEssenceSummaryEligible({
      text: "Habari.",
      recordingDurationMs: ESSENCE_SUMMARY_MIN_RECORDING_DURATION_MS,
    })).toBe(true);
  });

  it("rejects a summary that selects one of two conflicting prices", () => {
    const result = validateEssenceSummary({
      sourceText: "Kwanza nilisema 100.000 TZS, lakini baadaye nikasema 800.000 TZS.",
      translatedText: "Zunächst sagte er wiederholt, dass 100.000 TZS möglich seien; später nannte er jedoch mehrfach einen anderen Betrag von 800.000 TZS.",
      summary: "Er kann 800.000 TZS zahlen.",
    });
    expect(result).toMatchObject({
      valid: false,
      outcome: "critical_fact_guard_rejected",
      contradictionDetected: true,
      warningCount: 1,
      summary: null,
    });
  });

  it("treats an explicit null essence as not meaningful", () => {
    expect(validateEssenceSummary({
      sourceText: "Habari. Moja mbili tatu. Chakula. Usiku mwema.",
      translatedText: "Hallo. Eins zwei drei. Essen. Gute Nacht.",
      summary: null,
    })).toMatchObject({
      valid: false,
      outcome: "not_meaningful",
      summary: null,
    });
  });

  it("rejects a near-verbatim essence using one character-based ratio", () => {
    const translatedText = "Er braucht für seine Familie eine kleine Wohnung mit zwei Zimmern und erklärt ausführlich, warum diese Größe ausreicht.";
    const summary = "Er braucht für seine Familie eine kleine Wohnung mit zwei Zimmern und erklärt, warum diese Größe ausreicht.";
    const result = validateEssenceSummary({
      sourceText: translatedText,
      translatedText,
      summary,
    });
    expect(result).toMatchObject({
      valid: false,
      outcome: "insufficient_compression",
      summary: null,
    });
    expect(result.compressionRatio).toBeGreaterThan(
      ESSENCE_SUMMARY_MAX_COMPRESSION_RATIO,
    );
  });

  it("keeps a summary that explicitly preserves both conflicting prices", () => {
    expect(validateEssenceSummary({
      sourceText: "Kwanza nilisema 100.000 TZS, lakini baadaye nikasema 800.000 TZS.",
      translatedText: "Zunächst sagte er wiederholt, dass 100.000 TZS möglich seien; später nannte er jedoch mehrfach einen anderen Betrag von 800.000 TZS.",
      summary: "Die Aussage nennt widersprüchlich 100.000 TZS und 800.000 TZS.",
    })).toMatchObject({ valid: true, contradictionDetected: true });
  });
});
