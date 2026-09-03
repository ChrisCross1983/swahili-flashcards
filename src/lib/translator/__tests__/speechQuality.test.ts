import { describe, expect, it } from "vitest";
import {
  acceptSpeechQualityRecord,
  correctSpeechQualityRecord,
  createSpeechQualitySample,
  createUnreviewedSpeechQualityRecord,
  KISWAHILI_STT_REGRESSION_CASES,
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
