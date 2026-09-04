import type { TranslationLanguage, TranscriptionPath } from "@/lib/translator/types";
import type { TranslatorBuildMetadata } from "@/lib/translator/diagnosticMetadata";
import type { TranslatorConsentSnapshot } from "@/lib/translator/turnConsent";
import type { RecognitionReviewStatus } from "@/lib/translator/speechQuality";
import type { TranslatorAudioQualityMetrics } from "@/lib/translator/audioQuality";

export type SttRoutingDecision =
  | "realtime_primary"
  | "audio_fallback_cold"
  | "audio_rescue_semantic_failure"
  | "audio_safe_mode_circuit_breaker"
  | "audio_safe_mode_feature_flag";

export type SttCandidate = {
  model: string;
  path: TranscriptionPath;
  transcript: string | null;
  transcriptLength: number;
};

export type SttCandidateComparison = {
  turnId: string;
  createdAt: string;
  audioFingerprintSessionLocal: string;
  primary: SttCandidate;
  rescue: SttCandidate | null;
  didTranscriptChange: boolean | null;
  finalPath: SttRoutingDecision;
  rescueReason: "unsupported_language";
  translationOutcomeBeforeRescue: "unsupported_language";
  translationOutcomeAfterRescue: "success" | "unsupported_language" | "failure";
  primaryFailureToRescueStartMs: number | null;
  semanticRescueTotalMs: number | null;
};

export type TranslatorLearningSignalQuality = "low" | "medium" | "high";

export type TranslatorLearningSignal = {
  turnId: string;
  createdAt: string;
  buildMetadata: TranslatorBuildMetadata;
  sourceLanguage: TranslationLanguage | null;
  targetLanguage: TranslationLanguage | null;
  routingDecision: SttRoutingDecision;
  primaryModel: string | null;
  primaryPath: TranscriptionPath | null;
  rescueModel: string | null;
  rescuePath: TranscriptionPath | null;
  diagnosticCodes: string[];
  audioQualityMetrics: TranslatorAudioQualityMetrics | null;
  recognitionReviewStatus: RecognitionReviewStatus | null;
  correctionAvailable: boolean;
  sameAudioComparisonAvailable: boolean;
  userFeedbackAvailable: boolean;
  consentSnapshot: TranslatorConsentSnapshot | null;
  signalQuality: TranslatorLearningSignalQuality;
  benchmarkReadySameAudioSample: boolean;
};

export function transcriptScriptAnomalyDetected(text: string) {
  const letters = Array.from(text).filter((character) => /\p{L}/u.test(character));
  if (letters.length < 4) return false;
  const nonLatin = letters.filter((character) => !/\p{Script=Latin}/u.test(character));
  return nonLatin.length / letters.length >= 0.5;
}

export function learningSignalQuality(input: {
  sameAudioComparisonAvailable: boolean;
  reviewStatus: RecognitionReviewStatus | null;
  audioAvailable: boolean;
}) {
  if (
    input.sameAudioComparisonAvailable &&
    input.audioAvailable &&
    (input.reviewStatus === "accepted" || input.reviewStatus === "corrected")
  ) return "high" as const;
  return input.sameAudioComparisonAvailable ? "medium" as const : "low" as const;
}
