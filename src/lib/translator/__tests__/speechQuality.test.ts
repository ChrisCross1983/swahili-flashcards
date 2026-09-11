import { describe, expect, it } from "vitest";
import {
  acceptSpeechQualityRecord,
  correctSpeechQualityRecord,
  createSpeechQualitySample,
  createUnreviewedSpeechQualityRecord,
  KISWAHILI_STT_REGRESSION_CASES,
  normalizeTranscriptForComparison,
  reviewSameAudioComparison,
  summarizeSpeechBenchmarks,
  wordErrorRate,
  type SameAudioBenchmarkComparison,
} from "@/lib/translator/speechQuality";

const consent = {
  diagnosticsSharingEnabled: true,
  qualityContentSharingEnabled: false,
  speechSampleSharingEnabled: true,
  internalSpeechDiagnosticsEnabled: true,
};

describe("speech quality samples", () => {
  it("stores kupwa to kubwa as a correction without changing translation data", () => {
    const sample = createSpeechQualitySample({
      turnId: "turn-1", recognizedTranscript: "kupwa", correctedTranscript: "kubwa",
      sourceLanguage: "sw", transcriptionModel: "gpt-live-transcribe",
      transcriptionPath: "realtime", appVersion: "1.0",
    });
    expect(sample).toMatchObject({
      recognizedTranscript: "kupwa", correctedTranscript: "kubwa",
      transcriptCorrected: true, audioSharedRemotely: false,
    });
    expect(sample).not.toHaveProperty("translatedText");
  });

  it("freezes the recognized STT text and stores a Je correction as a reviewed sample", () => {
    const unreviewed = createUnreviewedSpeechQualityRecord({
      turnId: "turn-je", recognizedTranscript: "J kufanya kazi leo?",
      sourceLanguage: "sw", transcriptionModel: "gpt-live-transcribe",
      transcriptionPath: "realtime", appVersion: "1.0", audioEligible: true,
      consentAtRecordingStart: consent,
    });
    const corrected = correctSpeechQualityRecord(unreviewed, "Je kufanya kazi leo?");
    expect(corrected).toMatchObject({
      recognizedTranscript: "J kufanya kazi leo?",
      correctedTranscript: "Je kufanya kazi leo?",
      recognitionReviewStatus: "corrected", transcriptCorrected: true,
    });
    expect(corrected.sampleId).toBeTruthy();
  });

  it("stores a one-click positive review without inventing a correction", () => {
    const unreviewed = createUnreviewedSpeechQualityRecord({
      turnId: "turn-positive", recognizedTranscript: "Nyumba hii ni kubwa.",
      sourceLanguage: "sw", transcriptionModel: "gpt-live-transcribe",
      transcriptionPath: "realtime", appVersion: "1.0", audioEligible: true,
      consentAtRecordingStart: consent,
    });
    const accepted = acceptSpeechQualityRecord(unreviewed);
    expect(accepted).toMatchObject({
      recognizedTranscript: "Nyumba hii ni kubwa.",
      recognitionReviewStatus: "accepted", correctedTranscript: null,
      transcriptCorrected: false,
    });
    expect(accepted.sampleId).toBeTruthy();
  });

  it("keeps known errors as regression cases rather than production replacements", () => {
    expect(KISWAHILI_STT_REGRESSION_CASES).toContainEqual({ spoken: "kubwa", observed: "kupwa" });
    expect(KISWAHILI_STT_REGRESSION_CASES).toContainEqual({ spoken: "nzuri", observed: "suri" });
    expect(KISWAHILI_STT_REGRESSION_CASES).toContainEqual({ spoken: "Je", observed: "G / J" });
    expect(KISWAHILI_STT_REGRESSION_CASES).toContainEqual({ spoken: "moja", observed: "moji" });
    expect(KISWAHILI_STT_REGRESSION_CASES).toContainEqual({ spoken: "mbili", observed: "bili" });
  });
});

function comparison(
  primaryTranscript: string,
  secondaryTranscript: string,
): SameAudioBenchmarkComparison {
  return {
    comparisonId: "comparison-1", turnId: "turn-1",
    primaryEngine: "gpt-live-transcribe", secondaryEngine: "gpt-4o-mini-transcribe",
    primaryTranscript, secondaryTranscript,
    primaryCompletedAt: "2026-09-10T10:00:00.000Z",
    secondaryCompletedAt: "2026-09-10T10:00:01.000Z", sameAudio: true,
    recordingDurationMs: 2_000, primaryRoute: "realtime",
    secondaryRoute: "audio_upload_fallback", groundTruthStatus: "unreviewed",
    groundTruthTranscript: null, reviewedAt: null, benchmarkStatus: "completed",
    benchmarkFailure: null, secondaryTranscriptionMs: 1_000,
    primaryNormalizedExactMatch: null, secondaryNormalizedExactMatch: null,
    primaryWer: null, secondaryWer: null,
  };
}

describe("same-audio benchmark scoring", () => {
  it("normalizes only case, punctuation and whitespace", () => {
    expect(normalizeTranscriptForComparison("  Unaitwa,   NANI? ")).toBe("unaitwa nani");
    expect(normalizeTranscriptForComparison("kupwa")).not.toBe(normalizeTranscriptForComparison("kubwa"));
  });

  it("scores an audio-STT win against confirmed ground truth", () => {
    const reviewed = reviewSameAudioComparison(
      comparison("Una etwa nani? Mimi ni Chris.", "Unaitwa nani? Mimi ni Chris."),
      { status: "accepted_secondary", reviewedAt: "2026-09-10T10:01:00.000Z" },
    );
    expect(reviewed.secondaryWer).toBe(0);
    expect(reviewed.primaryWer).toBeGreaterThan(0);
    expect(summarizeSpeechBenchmarks([reviewed])).toMatchObject({ audioSttWins: 1, realtimeWins: 0, ties: 0 });
  });

  it("scores realtime wins, ties, and manual corrections deterministically", () => {
    const realtimeWin = reviewSameAudioComparison(comparison("Hamna shida.", "Hamna shinda."), { status: "accepted_primary" });
    const tie = reviewSameAudioComparison(comparison("Tafadhali.", "tafadhali"), { status: "equivalent" });
    const corrected = reviewSameAudioComparison(comparison("Maji kuba", "Maji baridi"), {
      status: "corrected", correctedTranscript: "Maji kubwa.",
    });
    const summary = summarizeSpeechBenchmarks([realtimeWin, tie, corrected]);
    expect(summary).toMatchObject({ realtimeWins: 1, audioSttWins: 0, ties: 2, sameAudioGroundTruthReviewed: 3 });
    expect(tie.primaryWer).toBe(0);
    expect(tie.secondaryWer).toBe(0);
    expect(wordErrorRate("Maji kuba", "Maji kubwa")).toBeGreaterThan(0);
  });

  it("excludes unreviewed and uncertain comparisons and reports evidence thresholds", () => {
    const unreviewed = comparison("A", "B");
    const uncertain = reviewSameAudioComparison(comparison("C", "D"), { status: "uncertain" });
    expect(summarizeSpeechBenchmarks([unreviewed, uncertain])).toMatchObject({
      sameAudioComparisonCompleted: 2, sameAudioGroundTruthReviewed: 0,
      realtimeWins: 0, audioSttWins: 0, ties: 0, uncertain: 1,
      benchmarkEvidenceLevel: "insufficient",
    });
    const reviewed = Array.from({ length: 20 }, (_, index) => reviewSameAudioComparison(
      { ...comparison("Sawa", "Sawa"), comparisonId: `comparison-${index}`, turnId: `turn-${index}` },
      { status: "equivalent" },
    ));
    expect(summarizeSpeechBenchmarks(reviewed).benchmarkEvidenceLevel).toBe("useful");
  });
});
