import { describe, expect, it } from "vitest";
import { selectPostConversationReviewCandidates } from "@/lib/translator/reviewCandidates";
import type { TranslationEntry } from "@/lib/translator/types";

function entry(id: string, diagnostics = {}, originalText = "Habari."): TranslationEntry {
  return {
    id,
    timestamp: 1,
    sourceLanguage: "sw",
    targetLanguage: "de",
    originalText,
    translatedText: "Guten Tag.",
    sourceWasDetected: true,
    diagnostics: diagnostics as TranslationEntry["diagnostics"],
  };
}

describe("post-conversation review selection", () => {
  it("prioritizes degradation, contradiction and negative feedback and stays bounded", () => {
    const entries = [
      entry("normal"),
      entry("degradation", { fallbackReason: "connection_lost_during_recording" }),
      entry("contradiction", { summaryContradictionDetected: true }),
      entry("number", {}, "Bei ya nyumba ni 100000 TZS."),
      entry("long", { recordingDurationMs: 60_000 }),
      entry("feedback"),
      entry("extra", { transcriptScriptAnomalyDetected: true }),
    ];
    const selected = selectPostConversationReviewCandidates({
      entries,
      feedbackByTurn: new Map([["feedback", {
        feedbackRating: "problem",
        feedbackCategories: ["translation_wrong"],
        feedbackComment: null,
      }]]),
    });
    expect(selected).toHaveLength(5);
    expect(selected.slice(0, 3)).toEqual([
      "degradation",
      "contradiction",
      "feedback",
    ]);
    expect(selected).not.toContain("normal");
  });

  it("finds the realistic cold fallback and 27-second summary turn", () => {
    const entries = [
      entry("cold", { fallbackReason: "realtime_not_ready_at_recording_start" }),
      entry("long-summary", { recordingDurationMs: 27_600, summaryEligible: true }),
      ...Array.from({ length: 6 }, (_, index) => entry(`normal-${index}`)),
    ];
    expect(selectPostConversationReviewCandidates({ entries })).toEqual([
      "long-summary",
      "cold",
    ]);
  });
});
