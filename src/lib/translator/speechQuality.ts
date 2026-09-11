import type { TranslatorAudioCaptureMetadata, TranslatorAudioQualityMetrics } from "@/lib/translator/audioQuality";
import { UNAVAILABLE_AUDIO_QUALITY } from "@/lib/translator/audioQuality";
import type { TranslatorConsentSnapshot } from "@/lib/translator/turnConsent";
import type { TranslationLanguage, TranscriptionPath } from "@/lib/translator/types";

export type RecognitionReviewStatus = "unreviewed" | "accepted" | "corrected";

export type BenchmarkGroundTruthStatus =
  | "unreviewed"
  | "accepted_primary"
  | "accepted_secondary"
  | "corrected"
  | "equivalent"
  | "uncertain";

export type SameAudioBenchmarkComparison = {
  comparisonId: string;
  turnId: string;
  primaryEngine: string;
  secondaryEngine: string;
  primaryTranscript: string;
  secondaryTranscript: string | null;
  primaryCompletedAt: string;
  secondaryCompletedAt: string | null;
  sameAudio: true;
  recordingDurationMs: number | null;
  primaryRoute: "realtime";
  secondaryRoute: "audio_upload_fallback";
  groundTruthStatus: BenchmarkGroundTruthStatus;
  groundTruthTranscript: string | null;
  reviewedAt: string | null;
  benchmarkStatus: "pending" | "completed" | "failed";
  benchmarkFailure: string | null;
  secondaryTranscriptionMs: number | null;
  primaryNormalizedExactMatch: boolean | null;
  secondaryNormalizedExactMatch: boolean | null;
  primaryWer: number | null;
  secondaryWer: number | null;
};

export type SpeechBenchmarkSummary = {
  sameAudioEligibleTurns: number;
  sameAudioComparisonAttempts: number;
  sameAudioComparisonCompleted: number;
  sameAudioGroundTruthReviewed: number;
  realtimeWins: number;
  audioSttWins: number;
  ties: number;
  uncertain: number;
  realtimeNormalizedExactMatchRate: number | null;
  audioSttNormalizedExactMatchRate: number | null;
  realtimeMeanWer: number | null;
  audioSttMeanWer: number | null;
  realtimeMedianWer: number | null;
  audioSttMedianWer: number | null;
  benchmarkEvidenceLevel: "insufficient" | "early" | "useful";
};

export function normalizeTranscriptForComparison(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function wordErrorRate(candidate: string, groundTruth: string) {
  const reference = normalizeTranscriptForComparison(groundTruth).split(" ").filter(Boolean);
  const hypothesis = normalizeTranscriptForComparison(candidate).split(" ").filter(Boolean);
  if (reference.length === 0) return hypothesis.length === 0 ? 0 : 1;
  const previous = Array.from({ length: hypothesis.length + 1 }, (_, index) => index);
  for (let referenceIndex = 1; referenceIndex <= reference.length; referenceIndex += 1) {
    const current = [referenceIndex];
    for (let hypothesisIndex = 1; hypothesisIndex <= hypothesis.length; hypothesisIndex += 1) {
      const substitutionCost = reference[referenceIndex - 1] === hypothesis[hypothesisIndex - 1]
        ? 0
        : 1;
      current[hypothesisIndex] = Math.min(
        previous[hypothesisIndex] + 1,
        current[hypothesisIndex - 1] + 1,
        previous[hypothesisIndex - 1] + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[hypothesis.length] / reference.length;
}

function scoreComparison(
  comparison: SameAudioBenchmarkComparison,
  status: BenchmarkGroundTruthStatus,
  groundTruthTranscript: string | null,
  reviewedAt: string | null,
): SameAudioBenchmarkComparison {
  const groundTruth = groundTruthTranscript?.trim() || null;
  if (!groundTruth || status === "unreviewed" || status === "uncertain") {
    return {
      ...comparison,
      groundTruthStatus: status,
      groundTruthTranscript: groundTruth,
      reviewedAt,
      primaryNormalizedExactMatch: null,
      secondaryNormalizedExactMatch: null,
      primaryWer: null,
      secondaryWer: null,
    };
  }
  const normalizedGroundTruth = normalizeTranscriptForComparison(groundTruth);
  return {
    ...comparison,
    groundTruthStatus: status,
    groundTruthTranscript: groundTruth,
    reviewedAt,
    primaryNormalizedExactMatch:
      normalizeTranscriptForComparison(comparison.primaryTranscript) === normalizedGroundTruth,
    secondaryNormalizedExactMatch: comparison.secondaryTranscript === null
      ? null
      : normalizeTranscriptForComparison(comparison.secondaryTranscript) === normalizedGroundTruth,
    primaryWer: wordErrorRate(comparison.primaryTranscript, groundTruth),
    secondaryWer: comparison.secondaryTranscript === null
      ? null
      : wordErrorRate(comparison.secondaryTranscript, groundTruth),
  };
}

export function reviewSameAudioComparison(
  comparison: SameAudioBenchmarkComparison,
  input: {
    status: Exclude<BenchmarkGroundTruthStatus, "unreviewed">;
    correctedTranscript?: string;
    reviewedAt?: string;
  },
) {
  const groundTruth = input.status === "accepted_primary"
    ? comparison.primaryTranscript
    : input.status === "accepted_secondary"
      ? comparison.secondaryTranscript
      : input.status === "equivalent"
        ? comparison.secondaryTranscript ?? comparison.primaryTranscript
        : input.status === "corrected"
          ? input.correctedTranscript?.trim() || null
          : input.correctedTranscript?.trim() || null;
  return scoreComparison(
    comparison,
    input.status,
    groundTruth,
    input.reviewedAt ?? new Date().toISOString(),
  );
}

function average(values: number[]) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function summarizeSpeechBenchmarks(
  comparisons: readonly SameAudioBenchmarkComparison[],
  eligibleTurns = comparisons.length,
): SpeechBenchmarkSummary {
  const completed = comparisons.filter((item) => item.benchmarkStatus === "completed");
  const reviewed = completed.filter((item) =>
    item.groundTruthStatus !== "unreviewed" && item.groundTruthStatus !== "uncertain" &&
    item.primaryWer !== null && item.secondaryWer !== null,
  );
  const uncertain = completed.filter((item) => item.groundTruthStatus === "uncertain").length;
  const primaryWers = reviewed.map((item) => item.primaryWer as number);
  const secondaryWers = reviewed.map((item) => item.secondaryWer as number);
  const realtimeWins = reviewed.filter((item) => (item.primaryWer as number) < (item.secondaryWer as number)).length;
  const audioSttWins = reviewed.filter((item) => (item.secondaryWer as number) < (item.primaryWer as number)).length;
  const ties = reviewed.length - realtimeWins - audioSttWins;
  return {
    sameAudioEligibleTurns: eligibleTurns,
    sameAudioComparisonAttempts: comparisons.length,
    sameAudioComparisonCompleted: completed.length,
    sameAudioGroundTruthReviewed: reviewed.length,
    realtimeWins,
    audioSttWins,
    ties,
    uncertain,
    realtimeNormalizedExactMatchRate: reviewed.length === 0 ? null :
      reviewed.filter((item) => item.primaryNormalizedExactMatch).length / reviewed.length,
    audioSttNormalizedExactMatchRate: reviewed.length === 0 ? null :
      reviewed.filter((item) => item.secondaryNormalizedExactMatch).length / reviewed.length,
    realtimeMeanWer: average(primaryWers),
    audioSttMeanWer: average(secondaryWers),
    realtimeMedianWer: median(primaryWers),
    audioSttMedianWer: median(secondaryWers),
    benchmarkEvidenceLevel: reviewed.length < 5
      ? "insufficient"
      : reviewed.length < 20
        ? "early"
        : "useful",
  };
}

export type TranslatorSpeechQualitySample = {
  sampleId: string | null;
  turnId: string;
  createdAt: string;
  audioFileRef: string | null;
  recognizedTranscript: string;
  recognitionReviewStatus: RecognitionReviewStatus;
  correctedTranscript: string | null;
  transcriptCorrected: boolean;
  correctedTranslation: string | null;
  sourceLanguage: TranslationLanguage | null;
  transcriptionModel: string;
  transcriptionPath: TranscriptionPath;
  fallbackUsed: boolean;
  appVersion: string;
  audioEligible: boolean;
  consentAtRecordingStart: TranslatorConsentSnapshot;
  audioMetadata: TranslatorAudioCaptureMetadata;
  audioQualityMetrics: TranslatorAudioQualityMetrics;
  audioIncludedInDiagnosticBundle: boolean;
  audioSharedRemotely: false;
  primaryTranscriptAvailable: boolean;
  rescueTranscriptAvailable: boolean;
  benchmarkReadySameAudioSample: boolean;
};

export const KISWAHILI_STT_REGRESSION_CASES = [
  { spoken: "Je", observed: "G / J" },
  { spoken: "kubwa", observed: "kupwa" },
  { spoken: "nzuri", observed: "suri" },
  { spoken: "tafadhali", observed: "tafasali" },
  { spoken: "unaitwa", observed: "una etwa" },
  { spoken: "moja", observed: "moji" },
  { spoken: "mbili", observed: "bili" },
] as const;

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `sample-${Date.now()}`;
}

export function createUnreviewedSpeechQualityRecord(input: {
  turnId: string;
  createdAt?: string;
  recognizedTranscript: string;
  sourceLanguage: TranslationLanguage | null;
  transcriptionModel: string;
  transcriptionPath: TranscriptionPath;
  appVersion: string;
  audioEligible: boolean;
  consentAtRecordingStart: TranslatorConsentSnapshot;
  audioMetadata?: Partial<TranslatorAudioCaptureMetadata>;
  audioQualityMetrics?: TranslatorAudioQualityMetrics;
}): TranslatorSpeechQualitySample {
  return {
    sampleId: null,
    turnId: input.turnId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    audioFileRef: null,
    recognizedTranscript: input.recognizedTranscript,
    recognitionReviewStatus: "unreviewed",
    correctedTranscript: null,
    transcriptCorrected: false,
    correctedTranslation: null,
    sourceLanguage: input.sourceLanguage,
    transcriptionModel: input.transcriptionModel,
    transcriptionPath: input.transcriptionPath,
    fallbackUsed: input.transcriptionPath === "audio_upload_fallback",
    appVersion: input.appVersion,
    audioEligible: input.audioEligible,
    consentAtRecordingStart: input.consentAtRecordingStart,
    audioMetadata: {
      mimeType: input.audioMetadata?.mimeType ?? null,
      sizeBytes: input.audioMetadata?.sizeBytes ?? null,
      durationMs: input.audioMetadata?.durationMs ?? null,
      sampleRate: input.audioMetadata?.sampleRate ?? null,
      channelCount: input.audioMetadata?.channelCount ?? null,
    },
    audioQualityMetrics: input.audioQualityMetrics ?? UNAVAILABLE_AUDIO_QUALITY,
    audioIncludedInDiagnosticBundle: false,
    audioSharedRemotely: false,
    primaryTranscriptAvailable: false,
    rescueTranscriptAvailable: false,
    benchmarkReadySameAudioSample: false,
  };
}

export function acceptSpeechQualityRecord(
  record: TranslatorSpeechQualitySample,
): TranslatorSpeechQualitySample {
  return {
    ...record,
    sampleId: record.sampleId ?? id(),
    recognitionReviewStatus: "accepted",
    correctedTranscript: null,
    transcriptCorrected: false,
  };
}

export function correctSpeechQualityRecord(
  record: TranslatorSpeechQualitySample,
  correctedTranscript: string,
): TranslatorSpeechQualitySample {
  return {
    ...record,
    sampleId: record.sampleId ?? id(),
    recognitionReviewStatus: "corrected",
    correctedTranscript: correctedTranscript.trim(),
    transcriptCorrected: true,
  };
}

/** Backward-compatible helper used by existing tests and callers. */
export function createSpeechQualitySample(input: {
  turnId: string;
  recognizedTranscript: string;
  correctedTranscript?: string | null;
  sourceLanguage: TranslationLanguage;
  transcriptionModel: string;
  transcriptionPath: TranscriptionPath;
  appVersion: string;
  audio?: { mimeType?: string | null; durationMs?: number | null; sizeBytes?: number | null };
  consentAtRecordingStart?: TranslatorConsentSnapshot;
}): TranslatorSpeechQualitySample {
  const consent = input.consentAtRecordingStart ?? {
    diagnosticsSharingEnabled: false,
    qualityContentSharingEnabled: false,
    speechSampleSharingEnabled: false,
    internalSpeechDiagnosticsEnabled: true,
  };
  const record = createUnreviewedSpeechQualityRecord({
    ...input,
    audioEligible: consent.speechSampleSharingEnabled,
    consentAtRecordingStart: consent,
    audioMetadata: {
      mimeType: input.audio?.mimeType,
      durationMs: input.audio?.durationMs,
      sizeBytes: input.audio?.sizeBytes,
    },
  });
  return input.correctedTranscript
    ? correctSpeechQualityRecord(record, input.correctedTranscript)
    : acceptSpeechQualityRecord(record);
}
