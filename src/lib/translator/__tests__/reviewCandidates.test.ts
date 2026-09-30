import { describe, expect, it } from "vitest";
import {
  countPendingPostConversationReviewCandidates,
  countReviewedPostConversationReviewCandidates,
  selectPostConversationReviewCandidates,
} from "@/lib/translator/reviewCandidates";
import type { TranslationEntry } from "@/lib/translator/types";
import {
  createUnreviewedSpeechQualityRecord,
  type TranslatorSpeechQualitySample,
} from "@/lib/translator/speechQuality";

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

  it("reports open work separately from the selected review window", () => {
    const selected = ["sw-1", "sw-2", "de-1", "de-2", "de-3"];
    const sample = (status: TranslatorSpeechQualitySample["recognitionReviewStatus"], turnId: string): TranslatorSpeechQualitySample => ({
      ...createUnreviewedSpeechQualityRecord({
        turnId, recognizedTranscript: "Habari", sourceLanguage: "sw",
        transcriptionModel: "gpt-4o-mini-transcribe", transcriptionPath: "audio_upload_fallback",
        appVersion: "test", audioEligible: true,
        consentAtRecordingStart: {
          diagnosticsSharingEnabled: false, qualityContentSharingEnabled: false,
          speechSampleSharingEnabled: true, internalSpeechDiagnosticsEnabled: true,
        },
      }),
      recognitionReviewStatus: status,
    });
    const reviewed = new Map<string, TranslatorSpeechQualitySample>([
      ["sw-1", sample("accepted", "sw-1")], ["sw-2", sample("corrected", "sw-2")],
      ["de-1", sample("accepted", "de-1")], ["de-2", sample("unreviewed", "de-2")],
      ["de-3", sample("unreviewed", "de-3")],
    ]);
    expect(countPendingPostConversationReviewCandidates(selected, reviewed)).toBe(2);
    expect(countReviewedPostConversationReviewCandidates(selected, reviewed)).toBe(3);

    reviewed.set("de-3", sample("corrected", "de-3"));
    expect(countPendingPostConversationReviewCandidates(selected, reviewed)).toBe(1);
    reviewed.set("de-2", sample("accepted", "de-2"));
    expect(countPendingPostConversationReviewCandidates(selected, reviewed)).toBe(0);
    expect(countReviewedPostConversationReviewCandidates(selected, reviewed)).toBe(5);
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
