import type {
  ClassicRealtimeConnectionAttempt,
  ClassicRealtimeConnectionStateTimelineEntry,
} from "@/lib/translator/classicRealtimeSessionManager";
import type { TranslatorFeedbackCategory, TranslatorFeedbackRating } from "@/lib/translator/feedback";
import type {
  TranslationDiagnostics,
  TranslationEntry,
  TranslationLanguage,
  TranslationMode,
  TranscriptionPath,
} from "@/lib/translator/types";
import type { TranslatorBuildMetadata } from "@/lib/translator/diagnosticMetadata";
import type { TranslatorDiagnosticsSettings } from "@/lib/translator/diagnosticsSettings";
import type {
  TranslatorAuthFailureType,
  TranslatorFailureCategory,
  TranslatorHealthStatus,
  TranslatorRecoveryAction,
} from "@/lib/translator/reliability";
import {
  summarizeSpeechBenchmarks,
  type RecognitionReviewStatus,
  type SameAudioBenchmarkComparison,
  type TranslatorSpeechQualitySample,
} from "@/lib/translator/speechQuality";
import type { TranslatorAudioQualityMetrics } from "@/lib/translator/audioQuality";
import { UNAVAILABLE_AUDIO_QUALITY } from "@/lib/translator/audioQuality";
import type {
  TranslatorDiagnosticEvent,
} from "@/lib/translator/diagnosticEvents";
import {
  expectedFallbackKind,
  primaryDiagnosticEvent,
} from "@/lib/translator/diagnosticEvents";
import type {
  TranslatorConsentEvent,
  TranslatorConsentSnapshot,
  TranslatorTurnConsent,
} from "@/lib/translator/turnConsent";
import { speechAudioEligibleForTurn } from "@/lib/translator/turnConsent";
import {
  learningSignalQuality,
  type SttCandidateComparison,
  type SttRoutingDecision,
  type TranslatorLearningSignal,
} from "@/lib/translator/sttRouting";
import { detectCriticalFactCategories } from "@/lib/translator/essenceSummary";
import {
  RECORDING_START_STUCK_THRESHOLD_MS,
  type RecordingStartAttempt,
} from "@/lib/translator/recordingStartDiagnostics";

const REPORT_VERSION = 5;
const REPORT_REVISION = "5.2.7";
const PERFORMANCE_OPTIMIZATION_VERSION = "classic-quality-hardening-v5.2.7";
const CLASSIC_TTS_MODEL = "gpt-4o-mini-tts";
const CLASSIC_TRANSLATION_MODEL = "gpt-5.6-terra";

export type ClassicTranslatorAudioMetadata = {
  audioMimeType: string | null;
  audioSize: number | null;
  durationMs?: number | null;
  sampleRate?: number | null;
  channelCount?: number | null;
  audioQualityMetrics?: TranslatorAudioQualityMetrics;
};

export type TranslatorRouteAuthDiagnostic = {
  attempted: boolean;
  succeeded: boolean | null;
  failureType: TranslatorAuthFailureType | null;
  durationMs: number | null;
};

export type ClassicTranslatorLocalFeedback = {
  feedbackRating: TranslatorFeedbackRating;
  feedbackCategories: TranslatorFeedbackCategory[];
  feedbackComment: string | null;
  feedbackType?: "all_correct" | "speech_recognition" | "translation" | "tts";
  speechFeedbackStatus?: "accepted" | "corrected" | null;
  correctedTranscript?: string | null;
  translationFeedback?: "positive" | "negative" | null;
  ttsFeedback?: "positive" | "negative" | null;
  persistenceStatus?: "local_only" | "sync_pending" | "synced" | "sync_failed";
};

export type ClassicTranslatorFailedTurn = {
  turnId: string;
  createdAt: string;
  mode: TranslationMode;
  sourceLanguage?: TranslationLanguage | null;
  targetLanguage?: TranslationLanguage | null;
  originalText?: string | null;
  translatedText?: string | null;
  diagnostics: Partial<TranslationDiagnostics>;
  transcriptionModel?: string | null;
  translationModel?: string | null;
  ttsModel?: string | null;
  ttsSpeed: number;
  audioMimeType?: string | null;
  audioSize?: number | null;
  errorCode: string;
  errorStage: string;
  errorType?: string | null;
  sanitizedErrorMessage: string;
  stateBeforeRecording?: string | null;
  stateAtFailure?: string | null;
  stateAfterCleanup?: string | null;
  recorderStatusBefore?: string | null;
  recorderStatusAtFailure?: string | null;
  recorderStatusAfterCleanup?: string | null;
  realtimeManagerStateBefore?: string | null;
  realtimeManagerStateAtFailure?: string | null;
  realtimeManagerStateAfterCleanup?: string | null;
  endpoint?: string | null;
  httpStatus?: number | null;
  apiErrorCode?: string | null;
  failureCategory?: TranslatorFailureCategory | null;
  retryable?: boolean;
  recoveryAction?: TranslatorRecoveryAction;
  recoverySucceeded?: boolean | null;
  audioBlobAvailable?: boolean;
  authCheckAttempted?: boolean;
  authCheckSucceeded?: boolean | null;
  authFailureType?: TranslatorAuthFailureType | null;
  diagnosticEvents?: TranslatorDiagnosticEvent[];
};

export type ClassicTranslatorRecoveryRecord = {
  failureCategory: TranslatorFailureCategory;
  errorStage: string;
  endpoint: string | null;
  httpStatus: number | null;
  apiErrorCode: string | null;
  retryable: boolean;
  recoveryAction: TranslatorRecoveryAction;
  recoverySucceeded: boolean | null;
  healthStatus: TranslatorHealthStatus;
  authCheckAttempted: boolean;
  authCheckSucceeded: boolean | null;
  authFailureType: TranslatorAuthFailureType | null;
};

type ClassicTranslatorIncident = {
  errorStage?: string | null;
  stateBeforeRecording?: string | null;
  stateAtFailure?: string | null;
  stateAfterCleanup?: string | null;
  recorderStatusBefore?: string | null;
  recorderStatusAtFailure?: string | null;
  recorderStatusAfterCleanup?: string | null;
  realtimeManagerStateBefore?: string | null;
  realtimeManagerStateAtFailure?: string | null;
  realtimeManagerStateAfterCleanup?: string | null;
  endpoint?: string | null;
  httpStatus?: number | null;
  apiErrorCode?: string | null;
  failureCategory?: TranslatorFailureCategory | null;
  retryable?: boolean;
  recoveryAction?: TranslatorRecoveryAction;
  recoverySucceeded?: boolean | null;
  audioBlobAvailable?: boolean;
  authCheckAttempted?: boolean;
  authCheckSucceeded?: boolean | null;
  authFailureType?: TranslatorAuthFailureType | null;
};

const PERFORMANCE_METRICS = [
  "recordClickToMicReadyMs",
  "recordClickToRecordingStartedMs",
  "realtimeSetupMs",
  "recordingDurationMs",
  "primaryFailureToRescueStartMs",
  "rescueTranscriptionMs",
  "rescueTranscriptToTranslationReadyMs",
  "semanticRescueTotalMs",
  "stopToTranscriptFinalMs",
  "transcriptFinalToTranslationRequestStartMs",
  "translationClientToServerMs",
  "translationServerPreOpenAiMs",
  "translationAuthMs",
  "translationBodyReadMs",
  "translationJsonParseMs",
  "translationValidationMs",
  "translationNormalizationMs",
  "translationPromptPreparationMs",
  "translationSchemaPreparationMs",
  "translationOpenAiClientPreparationMs",
  "translationOtherPreOpenAiMs",
  "translationOpenAiFirstResponseMs",
  "translationOpenAiTotalMs",
  "translationServerPostOpenAiMs",
  "translationServerToClientMs",
  "translationClientPostResponseMs",
  "translationRequestToVisibleMs",
  "transcriptFinalToTranslationVisibleMs",
  "transcriptFinalToTranslationReadyMs",
  "stopToTranslationVisibleMs",
  "translationReadyToTtsReadyMs",
  "translationVisibleToTtsRequestStartMs",
  "ttsClientToServerMs",
  "ttsServerPreOpenAiMs",
  "ttsAuthMs",
  "ttsBodyReadMs",
  "ttsJsonParseMs",
  "ttsValidationMs",
  "ttsNormalizationMs",
  "ttsInstructionPreparationMs",
  "ttsOpenAiClientPreparationMs",
  "ttsOtherPreOpenAiMs",
  "combinedPreOpenAiMs",
  "ttsOpenAiTimeToFirstByteMs",
  "ttsOpenAiTotalMs",
  "ttsServerStreamingOverheadMs",
  "ttsServerToClientFirstByteMs",
  "ttsClientDownloadTotalMs",
  "ttsAudioPreparationMs",
  "ttsPlayCallToStartedMs",
  "translationReadyToPlaybackStartedMs",
  "translationReadyToFirstPlayableAudioMs",
  "translationVisibleToFirstPlayableAudioMs",
  "stopToFirstPlayableAudioMs",
  "ttsRequestToReadyMs",
  "stopToTtsReadyMs",
  "ttsReadyToPlaybackStartedMs",
  "stopToPlaybackStartedMs",
  "interactionOverheadMs",
] as const;

export type ClassicCriticalPathStage = {
  stage: string;
  startAt: string;
  endAt: string;
  durationMs: number;
};

export type ClassicPerformanceBudgetViolation = {
  metric: string;
  budgetMs: number;
  actualMs: number;
};

type PerformanceMetric = (typeof PERFORMANCE_METRICS)[number];

export type ClassicTranslatorReportTurn = {
  turnId: string;
  createdAt: string;
  status: "success" | "failed";
  translatorMode: TranslationMode;
  sourceLanguage: TranslationLanguage | null;
  targetLanguage: TranslationLanguage | null;
  originalText: string | null;
  translatedText: string | null;
  essenceSummary: string | null;
  originalTextLength: number | null;
  translatedTextLength: number | null;
  transcriptionPath: TranscriptionPath | null;
  transcriptionModel: string | null;
  transcriptionFallbackUsed: boolean;
  fallbackReason: string | null;
  translationModel: string | null;
  ttsModel: string;
  ttsSpeed: number;
  connectionId: string | null;
  realtimeConnectionReadyAtRecordingStart: string | null;
  realtimeConnectionReused: boolean;
  realtimeConnectionAgeAtRecordingStartMs: number | null;
  warmStart: boolean;
  audioMimeType: string | null;
  audioSize: number | null;
  recordButtonClickedAt: string | null;
  getUserMediaStartedAt: string | null;
  getUserMediaReadyAt: string | null;
  mediaRecorderPreparedAt: string | null;
  recordingStartedAt: string | null;
  recordingStoppedAt: string | null;
  firstTranscriptDeltaAt: string | null;
  transcriptFinalAt: string | null;
  translationStartedAt: string | null;
  translationReadyAt: string | null;
  translationClientRequestStartedAt: string | null;
  translationRouteReceivedAt: string | null;
  translationAuthStartedAt: string | null;
  translationAuthCompletedAt: string | null;
  translationAuthClientPreparationStartedAt: string | null;
  translationAuthClientPreparationCompletedAt: string | null;
  translationAuthUserLookupStartedAt: string | null;
  translationAuthUserLookupCompletedAt: string | null;
  translationBodyReadStartedAt: string | null;
  translationBodyReadCompletedAt: string | null;
  translationJsonParseStartedAt: string | null;
  translationJsonParseCompletedAt: string | null;
  translationValidationStartedAt: string | null;
  translationValidationCompletedAt: string | null;
  translationInputNormalizationStartedAt: string | null;
  translationInputNormalizationCompletedAt: string | null;
  translationServiceEnteredAt: string | null;
  translationPromptPreparationStartedAt: string | null;
  translationPromptPreparationCompletedAt: string | null;
  translationSchemaPreparationStartedAt: string | null;
  translationSchemaPreparationCompletedAt: string | null;
  translationOpenAiClientReadyAt: string | null;
  translationServerRequestReceivedAt: string | null;
  translationServerParsingDoneAt: string | null;
  translationOpenAiRequestStartedAt: string | null;
  translationOpenAiFirstEventAt: string | null;
  translationOpenAiFirstByteAt: string | null;
  translationOpenAiCompletedAt: string | null;
  translationServerSerializationDoneAt: string | null;
  translationServerResponseStartedAt: string | null;
  translationClientResponseFirstByteAt: string | null;
  translationClientResponseCompletedAt: string | null;
  translationStateCommittedAt: string | null;
  translationVisibleAt: string | null;
  translationRequestCorrelationId: string | null;
  ttsDecisionAt: string | null;
  ttsRequested: boolean;
  ttsRequestReason: TranslationDiagnostics["ttsRequestReason"] | null;
  ttsGenerationOutcome: TranslationDiagnostics["ttsGenerationOutcome"] | null;
  ttsPlaybackOutcome: TranslationDiagnostics["ttsPlaybackOutcome"] | null;
  ttsOutcome: TranslationDiagnostics["ttsOutcome"] | null;
  ttsSkipReason: string | null;
  ttsRequestedAt: string | null;
  ttsStartedAt: string | null;
  ttsReadyAt: string | null;
  ttsClientRequestStartedAt: string | null;
  ttsRouteReceivedAt: string | null;
  ttsAuthStartedAt: string | null;
  ttsAuthCompletedAt: string | null;
  ttsAuthClientPreparationStartedAt: string | null;
  ttsAuthClientPreparationCompletedAt: string | null;
  ttsAuthUserLookupStartedAt: string | null;
  ttsAuthUserLookupCompletedAt: string | null;
  ttsBodyReadStartedAt: string | null;
  ttsBodyReadCompletedAt: string | null;
  ttsJsonParseStartedAt: string | null;
  ttsJsonParseCompletedAt: string | null;
  ttsValidationStartedAt: string | null;
  ttsValidationCompletedAt: string | null;
  ttsInputNormalizationStartedAt: string | null;
  ttsInputNormalizationCompletedAt: string | null;
  ttsServiceEnteredAt: string | null;
  ttsInstructionPreparationStartedAt: string | null;
  ttsInstructionPreparationCompletedAt: string | null;
  ttsOpenAiClientReadyAt: string | null;
  ttsServerRequestReceivedAt: string | null;
  ttsServerParsingDoneAt: string | null;
  ttsOpenAiRequestStartedAt: string | null;
  ttsOpenAiFirstByteAt: string | null;
  ttsOpenAiCompletedAt: string | null;
  ttsServerFirstByteSentAt: string | null;
  ttsServerCompletedAt: string | null;
  ttsClientFirstByteAt: string | null;
  ttsClientResponseCompletedAt: string | null;
  ttsAudioPreparationStartedAt: string | null;
  ttsAudioPreparationCompletedAt: string | null;
  ttsGenerationCompletedAt: string | null;
  firstPlayableAudioAt: string | null;
  playRequestedAt: string | null;
  ttsPlaybackRequestedAt: string | null;
  ttsRequestCorrelationId: string | null;
  playbackStartedAt: string | null;
  playbackCompletedAt: string | null;
  ttsPlaybackStartedAt: string | null;
  ttsPlaybackCompletedAt: string | null;
  ttsPlaybackInterruptedAt: string | null;
  ttsGenerationId: string | null;
  ttsPlaybackAttemptId: string | null;
  ttsPlaybackFromCache: boolean | null;
  ttsAudioByteLength: number | null;
  ttsAudioMimeType: string | null;
  ttsInputTextLength: number | null;
  ttsPlaybackCurrentTimeAtEnd: number | null;
  ttsPlaybackDurationAtEnd: number | null;
  ttsPlaybackCurrentTimeAtInterrupt: number | null;
  ttsPlaybackDurationAtInterrupt: number | null;
  recordClickToGetUserMediaReadyMs: number | null;
  recordClickToMicReadyMs: number | null;
  recordClickToRecordingStartedMs: number | null;
  getUserMediaToRecordingStartedMs: number | null;
  realtimeSetupMs: number | null;
  recordingDurationMs: number | null;
  microphoneAcquisitionAttemptId: string | null;
  microphoneAcquisitionStartedAt: string | null;
  microphoneAcquisitionCompletedAt: string | null;
  microphoneAcquisitionMs: number | null;
  microphoneAcquisitionOutcome: string | null;
  captureGeneration: number | null;
  freshStreamRequested: boolean;
  streamReused: boolean;
  trackReadyStateAtAcquisition: string | null;
  trackEnabledAtAcquisition: boolean | null;
  trackMutedAtAcquisition: boolean | null;
  mediaRecorderChunkCount: number;
  mediaRecorderTotalChunkBytes: number;
  audioBlobSize: number | null;
  audioSignalObserved: boolean | null;
  audioSignalEvidence: "measured" | "inferred_from_valid_audio" | "unavailable";
  realtimeTransportReady: boolean;
  realtimeInputTrackGeneration: number | null;
  realtimeFirstDeltaObserved: boolean;
  realtimeFinalTranscriptReceived: boolean;
  capturePathOutcome: string | null;
  sttRoutingDecision: SttRoutingDecision | null;
  primaryTranscript: string | null;
  primaryTranscriptionPath: TranscriptionPath | null;
  primaryTranscriptionModel: string | null;
  rescueTranscript: string | null;
  rescueTranscriptionPath: TranscriptionPath | null;
  rescueTranscriptionModel: string | null;
  finalTranscript: string | null;
  finalTranscriptionPath: TranscriptionPath | null;
  finalTranscriptionModel: string | null;
  primaryFailureToRescueStartMs: number | null;
  rescueTranscriptionMs: number | null;
  rescueTranscriptToTranslationReadyMs: number | null;
  semanticRescueTotalMs: number | null;
  transcriptScriptAnomalyDetected: boolean;
  trackRebindStartedAt: string | null;
  trackRebindCompletedAt: string | null;
  trackRebindMs: number | null;
  trackRebindOutcome: TranslationDiagnostics["trackRebindOutcome"] | null;
  senderHadTrackBeforeRebind: boolean | null;
  connectionStateBeforeRebind: RTCPeerConnectionState | null;
  connectionStateAfterRebind: RTCPeerConnectionState | null;
  summaryEligible: boolean;
  summaryGenerated: boolean;
  summaryLength: number;
  summaryCompressionRatio: number | null;
  summaryCriticalFactWarningCount: number;
  summaryContradictionDetected: boolean;
  summaryGenerationOutcome: TranslationDiagnostics["summaryGenerationOutcome"] | null;
  sttCandidateComparison: SttCandidateComparison | null;
  learningSignal: TranslatorLearningSignal | null;
  stopToTranscriptFinalMs: number | null;
  transcriptFinalToTranslationReadyMs: number | null;
  clientToTranslationServerMs: number | null;
  translationClientToServerMs: number | null;
  translationServerPreOpenAiMs: number | null;
  translationAuthMs: number | null;
  translationAuthClientPreparationMs: number | null;
  translationAuthUserLookupMs: number | null;
  translationBodyReadMs: number | null;
  translationJsonParseMs: number | null;
  translationValidationMs: number | null;
  translationNormalizationMs: number | null;
  translationPromptPreparationMs: number | null;
  translationSchemaPreparationMs: number | null;
  translationOpenAiClientPreparationMs: number | null;
  translationOtherPreOpenAiMs: number | null;
  translationOpenAiFirstResponseMs: number | null;
  translationOpenAiTotalMs: number | null;
  translationServerPostOpenAiMs: number | null;
  translationServerToClientMs: number | null;
  translationClientPostResponseMs: number | null;
  transcriptFinalToTranslationRequestStartMs: number | null;
  translationRequestToVisibleMs: number | null;
  transcriptFinalToTranslationVisibleMs: number | null;
  stopToTranslationVisibleMs: number | null;
  translationReadyToTtsReadyMs: number | null;
  translationVisibleToTtsRequestStartMs: number | null;
  ttsClientToServerMs: number | null;
  ttsServerPreOpenAiMs: number | null;
  ttsAuthMs: number | null;
  ttsAuthClientPreparationMs: number | null;
  ttsAuthUserLookupMs: number | null;
  ttsBodyReadMs: number | null;
  ttsJsonParseMs: number | null;
  ttsValidationMs: number | null;
  ttsNormalizationMs: number | null;
  ttsInstructionPreparationMs: number | null;
  ttsOpenAiClientPreparationMs: number | null;
  ttsOtherPreOpenAiMs: number | null;
  combinedPreOpenAiMs: number | null;
  ttsOpenAiTimeToFirstByteMs: number | null;
  ttsOpenAiTotalMs: number | null;
  ttsServerStreamingOverheadMs: number | null;
  ttsServerToClientFirstByteMs: number | null;
  ttsClientDownloadTotalMs: number | null;
  ttsAudioPreparationMs: number | null;
  ttsPlayCallToStartedMs: number | null;
  translationReadyToPlaybackStartedMs: number | null;
  translationReadyToFirstPlayableAudioMs: number | null;
  translationVisibleToFirstPlayableAudioMs: number | null;
  stopToFirstPlayableAudioMs: number | null;
  ttsRequestToReadyMs: number | null;
  stopToTtsReadyMs: number | null;
  ttsReadyToPlaybackStartedMs: number | null;
  stopToPlaybackStartedMs: number | null;
  interactionOverheadMs: number | null;
  serverTranscriptionMs: number | null;
  serverTranslationMs: number | null;
  serverTranslationTotalMs: number | null;
  translationRequestMs: number | null;
  ttsGenerationMs: number | null;
  ttsRequestMs: number | null;
  autoplayEnabled: boolean;
  translationStreamingUsed: boolean;
  ttsStreamingUsed: boolean;
  earlyTtsUsed: boolean;
  streamingFallbackReason: string | null;
  criticalPath: ClassicCriticalPathStage[];
  performanceBudgetViolations: ClassicPerformanceBudgetViolation[];
  transcriptionPathDecisionAt: string | null;
  transcriptionPathDecisionReason: string | null;
  feedbackRating: TranslatorFeedbackRating | null;
  feedbackCategories: TranslatorFeedbackCategory[] | null;
  feedbackComment: string | null;
  feedbackType: ClassicTranslatorLocalFeedback["feedbackType"] | null;
  speechFeedbackStatus: ClassicTranslatorLocalFeedback["speechFeedbackStatus"] | null;
  translationFeedback: ClassicTranslatorLocalFeedback["translationFeedback"] | null;
  ttsFeedback: ClassicTranslatorLocalFeedback["ttsFeedback"] | null;
  feedbackPersistenceStatus: ClassicTranslatorLocalFeedback["persistenceStatus"] | null;
  errorStage: string | null;
  errorType: string | null;
  errorCode: string | null;
  sanitizedErrorMessage: string | null;
  stateBeforeRecording: string | null;
  stateAtFailure: string | null;
  stateAfterCleanup: string | null;
  recorderStatusBefore: string | null;
  recorderStatusAtFailure: string | null;
  recorderStatusAfterCleanup: string | null;
  realtimeManagerStateBefore: string | null;
  realtimeManagerStateAtFailure: string | null;
  realtimeManagerStateAfterCleanup: string | null;
  endpoint: string | null;
  httpStatus: number | null;
  apiErrorCode: string | null;
  failureCategory: TranslatorFailureCategory | null;
  retryable: boolean;
  recoveryAction: TranslatorRecoveryAction;
  recoverySucceeded: boolean | null;
  audioBlobAvailable: boolean;
  authCheckAttempted: boolean;
  authCheckSucceeded: boolean | null;
  authFailureType: TranslatorAuthFailureType | null;
  recognizedTranscript: string | null;
  correctedTranscript: string | null;
  transcriptCorrected: boolean;
  correctedTranslation: string | null;
  audioIncludedInDiagnosticBundle: boolean;
  audioSharedRemotely: boolean;
  diagnosticEvents: TranslatorDiagnosticEvent[];
  consentAtRecordingStart: TranslatorConsentSnapshot | null;
  consentAtTurnFinalization: TranslatorConsentSnapshot | null;
  translationAuthDiagnostic: TranslatorRouteAuthDiagnostic;
  ttsAuthDiagnostic: TranslatorRouteAuthDiagnostic;
  recognitionReviewStatus: RecognitionReviewStatus | null;
  speechQualitySampleId: string | null;
  speechAudioEligibleForTurn: boolean;
  audioMetadata: {
    mimeType: string | null;
    sizeBytes: number | null;
    durationMs: number | null;
    sampleRate: number | null;
    channelCount: number | null;
  };
  audioQualityMetrics: TranslatorAudioQualityMetrics;
  sameAudioBenchmarkAttempted: boolean;
  sameAudioBenchmarkCompleted: boolean;
  secondaryTranscriptionModel: string | null;
  secondaryTranscriptionMs: number | null;
  secondaryBenchmarkMs: number | null;
  benchmarkReviewStatus: SameAudioBenchmarkComparison["groundTruthStatus"] | null;
  benchmarkGroundTruthAvailable: boolean;
  primaryWer: number | null;
  secondaryWer: number | null;
  sameAudioBenchmark: SameAudioBenchmarkComparison | null;
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

function audioQualityWithEvidence(
  metrics: TranslatorAudioQualityMetrics | undefined,
): TranslatorAudioQualityMetrics {
  const value = metrics ?? UNAVAILABLE_AUDIO_QUALITY;
  return {
    ...value,
    evidence: value.evidence ??
      (value.source === "unavailable" ? "unavailable" : "measured"),
  };
}

function combinedPreOpenAiMs(
  translationValue: unknown,
  ttsValue: unknown,
) {
  const translation = finite(translationValue);
  const tts = finite(ttsValue);
  return translation === null || tts === null ? null : translation + tts;
}

function metricSummary(values: Array<number | null>) {
  const sorted = values
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { count: 0, average: null, median: null, min: null, max: null };
  }
  const sum = sorted.reduce((total, value) => total + value, 0);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return {
    count: sorted.length,
    average: Math.round(sum / sorted.length),
    median: Number(median.toFixed(2)),
    p90: sorted[Math.ceil(sorted.length * 0.9) - 1],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function performanceGroup(turns: ClassicTranslatorReportTurn[]) {
  return Object.fromEntries(
    PERFORMANCE_METRICS.map((metric) => [
      metric,
      metricSummary(turns.map((turn) => turn[metric])),
    ]),
  ) as Record<PerformanceMetric, ReturnType<typeof metricSummary>>;
}

function bottleneckSummary(turns: ClassicTranslatorReportTurn[]) {
  const values = new Map<string, number[]>();
  for (const turn of turns) {
    for (const item of turn.criticalPath) {
      const current = values.get(item.stage) ?? [];
      current.push(item.durationMs);
      values.set(item.stage, current);
    }
  }
  const ranked = Array.from(values, ([stage, durations]) => ({
    stage,
    median: metricSummary(durations).median,
  }))
    .filter((item): item is { stage: string; median: number } =>
      typeof item.median === "number",
    )
    .sort((left, right) => right.median - left.median);
  return {
    largestMedianStage: ranked[0]?.stage ?? null,
    largestMedianStageMs: ranked[0]?.median ?? null,
    secondLargestMedianStage: ranked[1]?.stage ?? null,
    secondLargestMedianStageMs: ranked[1]?.median ?? null,
  };
}

const TRANSLATION_PRE_OPENAI_STAGES = [
  ["auth", "translationAuthMs"],
  ["body_read", "translationBodyReadMs"],
  ["json_parse", "translationJsonParseMs"],
  ["validation", "translationValidationMs"],
  ["normalization", "translationNormalizationMs"],
  ["prompt_preparation", "translationPromptPreparationMs"],
  ["schema_preparation", "translationSchemaPreparationMs"],
  ["openai_client_preparation", "translationOpenAiClientPreparationMs"],
  ["other", "translationOtherPreOpenAiMs"],
] as const;

const TTS_PRE_OPENAI_STAGES = [
  ["auth", "ttsAuthMs"],
  ["body_read", "ttsBodyReadMs"],
  ["json_parse", "ttsJsonParseMs"],
  ["validation", "ttsValidationMs"],
  ["normalization", "ttsNormalizationMs"],
  ["instruction_preparation", "ttsInstructionPreparationMs"],
  ["openai_client_preparation", "ttsOpenAiClientPreparationMs"],
  ["other", "ttsOtherPreOpenAiMs"],
] as const;

function largestPreOpenAiStage(
  turns: ClassicTranslatorReportTurn[],
  stages: ReadonlyArray<readonly [string, keyof ClassicTranslatorReportTurn]>,
) {
  return stages.reduce<{ stage: string | null; medianMs: number | null }>(
    (largest, [stage, metric]) => {
      const summary = metricSummary(
        turns.map((turn) => finite(turn[metric])),
      );
      return summary.median !== null &&
        (largest.medianMs === null || summary.median > largest.medianMs)
        ? { stage, medianMs: summary.median }
        : largest;
    },
    { stage: null, medianMs: null },
  );
}

function preOpenAiBottleneckSummary(turns: ClassicTranslatorReportTurn[]) {
  const translation = largestPreOpenAiStage(
    turns,
    TRANSLATION_PRE_OPENAI_STAGES,
  );
  const tts = largestPreOpenAiStage(turns, TTS_PRE_OPENAI_STAGES);
  return {
    largestTranslationPreOpenAiStage: translation.stage,
    largestTranslationPreOpenAiStageMedianMs: translation.medianMs,
    largestTtsPreOpenAiStage: tts.stage,
    largestTtsPreOpenAiStageMedianMs: tts.medianMs,
  };
}

export function sanitizeClassicReportError(message: string) {
  return message
    .replace(/\b(?:OPENAI_API_KEY|SUPABASE_SESSION_TOKEN|JWT)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED]")
    .replace(/Authorization\s*:\s*(?:Bearer\s+)?[^\s,;]+/gi, "[REDACTED]")
    .replace(/Cookie\s*:\s*[^\r\n]+/gi, "[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/ephemeral[-_ ]?(?:secret|key)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED]")
    .slice(0, 500);
}

function modeForEntry(entry: TranslationEntry): TranslationMode {
  if (entry.sourceWasDetected) return "auto";
  return entry.sourceLanguage === "de" ? "de-to-sw" : "sw-to-de";
}

function criticalPathStage(
  stage: string,
  startAt: unknown,
  endAt: unknown,
  durationMs: unknown,
) {
  const measured = finite(durationMs);
  return typeof startAt === "string" &&
    typeof endAt === "string" &&
    measured !== null
    ? { stage, startAt, endAt, durationMs: measured }
    : null;
}

function buildCriticalPath(d: Partial<TranslationDiagnostics>) {
  const ttsRemaining =
    finite(d.ttsOpenAiTotalMs) !== null &&
    finite(d.ttsOpenAiTimeToFirstByteMs) !== null &&
    (finite(d.ttsOpenAiTotalMs) as number) >=
      (finite(d.ttsOpenAiTimeToFirstByteMs) as number)
      ? (finite(d.ttsOpenAiTotalMs) as number) -
        (finite(d.ttsOpenAiTimeToFirstByteMs) as number)
      : null;
  return [
    criticalPathStage("record_start_overhead", d.recordButtonClickedAt, d.recordingStartedAt, d.recordClickToRecordingStartedMs),
    criticalPathStage("realtime_transcript_finalize", d.recordingStoppedAt, d.transcriptFinalAt, d.stopToTranscriptFinalMs),
    criticalPathStage("translation_client_to_server", d.translationClientRequestStartedAt, d.translationServerRequestReceivedAt, d.clientToTranslationServerMs),
    criticalPathStage("translation_server_pre_openai", d.translationServerRequestReceivedAt, d.translationOpenAiRequestStartedAt, d.translationServerPreOpenAiMs),
    criticalPathStage("translation_auth", d.translationAuthStartedAt, d.translationAuthCompletedAt, d.translationAuthMs),
    criticalPathStage("translation_auth_client_prepare", d.translationAuthClientPreparationStartedAt, d.translationAuthClientPreparationCompletedAt, d.translationAuthClientPreparationMs),
    criticalPathStage("translation_auth_user_lookup", d.translationAuthUserLookupStartedAt, d.translationAuthUserLookupCompletedAt, d.translationAuthUserLookupMs),
    criticalPathStage("translation_body_read", d.translationBodyReadStartedAt, d.translationBodyReadCompletedAt, d.translationBodyReadMs),
    criticalPathStage("translation_json_parse", d.translationJsonParseStartedAt, d.translationJsonParseCompletedAt, d.translationJsonParseMs),
    criticalPathStage("translation_validation", d.translationValidationStartedAt, d.translationValidationCompletedAt, d.translationValidationMs),
    criticalPathStage("translation_normalization", d.translationInputNormalizationStartedAt, d.translationInputNormalizationCompletedAt, d.translationNormalizationMs),
    criticalPathStage("translation_prompt_prepare", d.translationPromptPreparationStartedAt, d.translationPromptPreparationCompletedAt, d.translationPromptPreparationMs),
    criticalPathStage("translation_schema_prepare", d.translationSchemaPreparationStartedAt, d.translationSchemaPreparationCompletedAt, d.translationSchemaPreparationMs),
    criticalPathStage("translation_openai_client_prepare", d.translationServiceEnteredAt, d.translationOpenAiClientReadyAt, d.translationOpenAiClientPreparationMs),
    criticalPathStage("translation_openai", d.translationOpenAiRequestStartedAt, d.translationOpenAiCompletedAt, d.translationOpenAiTotalMs),
    criticalPathStage("translation_server_post_openai", d.translationOpenAiCompletedAt, d.translationServerSerializationDoneAt, d.translationServerPostOpenAiMs),
    criticalPathStage("translation_server_to_client", d.translationServerResponseStartedAt, d.translationClientResponseFirstByteAt, d.translationServerToClientMs),
    criticalPathStage("translation_client_render", d.translationClientResponseCompletedAt, d.translationVisibleAt, d.translationClientPostResponseMs),
    criticalPathStage("tts_client_to_server", d.ttsClientRequestStartedAt, d.ttsServerRequestReceivedAt, d.ttsClientToServerMs),
    criticalPathStage("tts_server_pre_openai", d.ttsServerRequestReceivedAt, d.ttsOpenAiRequestStartedAt, d.ttsServerPreOpenAiMs),
    criticalPathStage("tts_auth", d.ttsAuthStartedAt, d.ttsAuthCompletedAt, d.ttsAuthMs),
    criticalPathStage("tts_auth_client_prepare", d.ttsAuthClientPreparationStartedAt, d.ttsAuthClientPreparationCompletedAt, d.ttsAuthClientPreparationMs),
    criticalPathStage("tts_auth_user_lookup", d.ttsAuthUserLookupStartedAt, d.ttsAuthUserLookupCompletedAt, d.ttsAuthUserLookupMs),
    criticalPathStage("tts_body_read", d.ttsBodyReadStartedAt, d.ttsBodyReadCompletedAt, d.ttsBodyReadMs),
    criticalPathStage("tts_json_parse", d.ttsJsonParseStartedAt, d.ttsJsonParseCompletedAt, d.ttsJsonParseMs),
    criticalPathStage("tts_validation", d.ttsValidationStartedAt, d.ttsValidationCompletedAt, d.ttsValidationMs),
    criticalPathStage("tts_normalization", d.ttsInputNormalizationStartedAt, d.ttsInputNormalizationCompletedAt, d.ttsNormalizationMs),
    criticalPathStage("tts_instruction_prepare", d.ttsInstructionPreparationStartedAt, d.ttsInstructionPreparationCompletedAt, d.ttsInstructionPreparationMs),
    criticalPathStage("tts_openai_client_prepare", d.ttsServiceEnteredAt, d.ttsOpenAiClientReadyAt, d.ttsOpenAiClientPreparationMs),
    criticalPathStage("tts_openai_to_first_byte", d.ttsOpenAiRequestStartedAt, d.ttsOpenAiFirstByteAt, d.ttsOpenAiTimeToFirstByteMs),
    criticalPathStage("tts_openai_remaining", d.ttsOpenAiFirstByteAt, d.ttsOpenAiCompletedAt, ttsRemaining),
    criticalPathStage("tts_server_to_client", d.ttsServerFirstByteSentAt, d.ttsClientFirstByteAt, d.ttsServerToClientFirstByteMs),
    criticalPathStage("tts_client_audio_prepare", d.ttsAudioPreparationStartedAt, d.ttsAudioPreparationCompletedAt, d.ttsAudioPreparationMs),
    criticalPathStage("play_start", d.playRequestedAt, d.playbackStartedAt, d.ttsPlayCallToStartedMs),
  ].filter((stage): stage is ClassicCriticalPathStage => stage !== null);
}

function budgetViolations(d: Partial<TranslationDiagnostics>) {
  const budgets = [
    ["warmRecordClickToRecordingStartedMs", d.warmStart ? d.recordClickToRecordingStartedMs : null, 100],
    ["stopToTranscriptFinalMs", d.stopToTranscriptFinalMs, 1_200],
    ["transcriptFinalToTranslationVisibleMs", d.transcriptFinalToTranslationVisibleMs, 3_000],
    ["translationVisibleToFirstPlayableAudioMs", d.translationVisibleToFirstPlayableAudioMs, 1_500],
    ["stopToPlaybackStartedMs", d.stopToPlaybackStartedMs, 5_000],
    ["translationAuthMs", d.translationAuthMs, 150],
    ["translationValidationMs", d.translationValidationMs, 50],
    ["translationPromptPreparationMs", d.translationPromptPreparationMs, 20],
    ["translationOpenAiClientPreparationMs", d.translationOpenAiClientPreparationMs, 20],
    ["translationServerPreOpenAiMs", d.translationServerPreOpenAiMs, 300],
    ["ttsAuthMs", d.ttsAuthMs, 150],
    ["ttsValidationMs", d.ttsValidationMs, 50],
    ["ttsInstructionPreparationMs", d.ttsInstructionPreparationMs, 20],
    ["ttsOpenAiClientPreparationMs", d.ttsOpenAiClientPreparationMs, 20],
    ["ttsServerPreOpenAiMs", d.ttsServerPreOpenAiMs, 300],
    [
      "combinedPreOpenAiMs",
      combinedPreOpenAiMs(
        d.translationServerPreOpenAiMs,
        d.ttsServerPreOpenAiMs,
      ),
      600,
    ],
  ] as const;
  return budgets.flatMap(([metric, value, budgetMs]) => {
    const actualMs = finite(value);
    return actualMs !== null && actualMs >= budgetMs
      ? [{ metric, budgetMs, actualMs }]
      : [];
  });
}

function routeAuthDiagnostic(input: {
  route: "translation" | "tts";
  diagnostics: Partial<TranslationDiagnostics>;
  events: readonly TranslatorDiagnosticEvent[];
}) : TranslatorRouteAuthDiagnostic {
  const prefix = input.route === "translation" ? "translation" : "tts";
  const duration = finite(
    prefix === "translation"
      ? input.diagnostics.translationAuthMs
      : input.diagnostics.ttsAuthMs,
  );
  const startedAt = prefix === "translation"
    ? input.diagnostics.translationAuthStartedAt
    : input.diagnostics.ttsAuthStartedAt;
  const endpoint = prefix === "translation"
    ? "/api/translator/translate"
    : "/api/translator/speech";
  const organicRouteEvent = input.events.find(
    (event) => event.eventOrigin === "organic_runtime" && event.endpoint === endpoint,
  );
  const attempted = duration !== null || typeof startedAt === "string" ||
    (organicRouteEvent?.httpStatus !== null && organicRouteEvent?.httpStatus !== undefined);
  const failureType = organicRouteEvent?.authFailureType ?? null;
  return {
    attempted,
    succeeded: !attempted ? null : failureType ? false : true,
    failureType,
    durationMs: duration,
  };
}

function legacyDiagnosticEvent(input: {
  turnId: string;
  at: string;
  status: "success" | "failed";
  incident: ClassicTranslatorIncident;
}): TranslatorDiagnosticEvent {
  const qaScenarioId = input.incident.apiErrorCode?.startsWith("qa_")
    ? input.incident.apiErrorCode
    : null;
  const eventKind = input.status === "failed"
    ? "failure" as const
    : input.incident.failureCategory === "REALTIME"
      ? expectedFallbackKind(input.incident.apiErrorCode)
      : "degradation" as const;
  return {
    eventId: `legacy-${input.turnId}`,
    at: input.at,
    eventOrigin: qaScenarioId ? "qa_simulation" : "organic_runtime",
    eventKind,
    category: input.incident.failureCategory ?? "UNKNOWN",
    stage: input.incident.errorStage ?? "unknown",
    endpoint: input.incident.endpoint ?? null,
    httpStatus: input.incident.httpStatus ?? null,
    apiCode: input.incident.apiErrorCode ?? null,
    retryable: input.incident.retryable === true,
    recoveryAction: input.incident.recoveryAction ?? "none",
    recoverySucceeded: input.incident.recoverySucceeded ?? null,
    qaScenarioId,
    authFailureType: input.incident.authFailureType ?? null,
  };
}

function turnFromValues(input: {
  turnId: string;
  createdAt: string;
  status: "success" | "failed";
  mode: TranslationMode;
  sourceLanguage: TranslationLanguage | null;
  targetLanguage: TranslationLanguage | null;
  originalText: string | null;
  translatedText: string | null;
  essenceSummary?: string | null;
  diagnostics: Partial<TranslationDiagnostics>;
  audio: ClassicTranslatorAudioMetadata;
  transcriptionModel: string | null;
  translationModel: string | null;
  ttsModel: string | null;
  ttsSpeed: number;
  feedback: ClassicTranslatorLocalFeedback | null;
  errorStage: string | null;
  errorType: string | null;
  errorCode: string | null;
  sanitizedErrorMessage: string | null;
  incident?: ClassicTranslatorIncident | null;
  quality?: TranslatorSpeechQualitySample | null;
  audioIncludedInDiagnosticBundle?: boolean;
  audioBlobAvailable?: boolean;
  diagnosticEvents?: TranslatorDiagnosticEvent[];
  consent?: TranslatorTurnConsent | null;
  sttRoutingDecision?: SttRoutingDecision | null;
  sttCandidateComparison?: SttCandidateComparison | null;
  sameAudioBenchmark?: SameAudioBenchmarkComparison | null;
}): ClassicTranslatorReportTurn {
  const d = input.diagnostics;
  const path = d.transcriptionPath ?? null;
  const text = input.originalText;
  const translated = input.translatedText;
  const diagnosticEvents = input.diagnosticEvents ?? [];
  const primaryEvent = primaryDiagnosticEvent(diagnosticEvents);
  const translationAuthDiagnostic = routeAuthDiagnostic({
    route: "translation",
    diagnostics: d,
    events: diagnosticEvents,
  });
  const ttsAuthDiagnostic = routeAuthDiagnostic({
    route: "tts",
    diagnostics: d,
    events: diagnosticEvents,
  });
  const attemptedAuth = [translationAuthDiagnostic, ttsAuthDiagnostic]
    .filter((auth) => auth.attempted);
  const contentAllowed = Boolean(
    input.consent &&
    ((input.consent.consentAtRecordingStart.qualityContentSharingEnabled &&
      input.consent.consentAtTurnFinalization?.qualityContentSharingEnabled) ||
      (input.consent.consentAtRecordingStart.internalSpeechDiagnosticsEnabled &&
        input.consent.consentAtTurnFinalization?.internalSpeechDiagnosticsEnabled)),
  );
  const sttCandidateComparison = input.sttCandidateComparison
    ? {
        ...input.sttCandidateComparison,
        primary: {
          ...input.sttCandidateComparison.primary,
          transcript: contentAllowed
            ? input.sttCandidateComparison.primary.transcript : null,
        },
        rescue: input.sttCandidateComparison.rescue
          ? {
              ...input.sttCandidateComparison.rescue,
              transcript: contentAllowed
                ? input.sttCandidateComparison.rescue.transcript : null,
            }
          : null,
      }
    : null;
  const sameAudioBenchmark = input.sameAudioBenchmark
    ? {
        ...input.sameAudioBenchmark,
        primaryTranscript: contentAllowed ? input.sameAudioBenchmark.primaryTranscript : "",
        secondaryTranscript: contentAllowed ? input.sameAudioBenchmark.secondaryTranscript : null,
        groundTruthTranscript: contentAllowed ? input.sameAudioBenchmark.groundTruthTranscript : null,
      }
    : null;
  return {
    turnId: input.turnId,
    createdAt: input.createdAt,
    status: input.status,
    translatorMode: input.mode,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    originalText: text,
    translatedText: translated,
    essenceSummary: input.essenceSummary ?? null,
    originalTextLength: text === null ? null : text.length,
    translatedTextLength: translated === null ? null : translated.length,
    transcriptionPath: path,
    transcriptionModel: input.transcriptionModel,
    transcriptionFallbackUsed:
      path === "audio_upload_fallback" || d.transcriptionFallbackUsed === true,
    fallbackReason: d.fallbackReason ?? null,
    translationModel: input.translationModel,
    ttsModel: input.ttsModel ?? CLASSIC_TTS_MODEL,
    ttsSpeed: input.ttsSpeed,
    connectionId: d.connectionId ?? null,
    realtimeConnectionReadyAtRecordingStart:
      d.realtimeConnectionReadyAtRecordingStart ?? null,
    realtimeConnectionReused: d.realtimeConnectionReused === true,
    realtimeConnectionAgeAtRecordingStartMs: finite(
      d.realtimeConnectionAgeAtRecordingStartMs,
    ),
    warmStart: d.warmStart === true,
    audioMimeType: input.audio.audioMimeType,
    audioSize: input.audio.audioSize,
    recordButtonClickedAt: d.recordButtonClickedAt ?? null,
    getUserMediaStartedAt: d.getUserMediaStartedAt ?? null,
    getUserMediaReadyAt: d.getUserMediaReadyAt ?? null,
    mediaRecorderPreparedAt: d.mediaRecorderPreparedAt ?? null,
    recordingStartedAt: d.recordingStartedAt ?? null,
    recordingStoppedAt: d.recordingStoppedAt ?? null,
    firstTranscriptDeltaAt: d.firstTranscriptDeltaAt ?? null,
    transcriptFinalAt: d.transcriptFinalAt ?? null,
    translationStartedAt: d.translationStartedAt ?? null,
    translationReadyAt: d.translationReadyAt ?? null,
    translationClientRequestStartedAt: d.translationClientRequestStartedAt ?? null,
    translationRouteReceivedAt: d.translationRouteReceivedAt ?? null,
    translationAuthStartedAt: d.translationAuthStartedAt ?? null,
    translationAuthCompletedAt: d.translationAuthCompletedAt ?? null,
    translationAuthClientPreparationStartedAt:
      d.translationAuthClientPreparationStartedAt ?? null,
    translationAuthClientPreparationCompletedAt:
      d.translationAuthClientPreparationCompletedAt ?? null,
    translationAuthUserLookupStartedAt:
      d.translationAuthUserLookupStartedAt ?? null,
    translationAuthUserLookupCompletedAt:
      d.translationAuthUserLookupCompletedAt ?? null,
    translationBodyReadStartedAt: d.translationBodyReadStartedAt ?? null,
    translationBodyReadCompletedAt: d.translationBodyReadCompletedAt ?? null,
    translationJsonParseStartedAt: d.translationJsonParseStartedAt ?? null,
    translationJsonParseCompletedAt: d.translationJsonParseCompletedAt ?? null,
    translationValidationStartedAt: d.translationValidationStartedAt ?? null,
    translationValidationCompletedAt: d.translationValidationCompletedAt ?? null,
    translationInputNormalizationStartedAt:
      d.translationInputNormalizationStartedAt ?? null,
    translationInputNormalizationCompletedAt:
      d.translationInputNormalizationCompletedAt ?? null,
    translationServiceEnteredAt: d.translationServiceEnteredAt ?? null,
    translationPromptPreparationStartedAt:
      d.translationPromptPreparationStartedAt ?? null,
    translationPromptPreparationCompletedAt:
      d.translationPromptPreparationCompletedAt ?? null,
    translationSchemaPreparationStartedAt:
      d.translationSchemaPreparationStartedAt ?? null,
    translationSchemaPreparationCompletedAt:
      d.translationSchemaPreparationCompletedAt ?? null,
    translationOpenAiClientReadyAt:
      d.translationOpenAiClientReadyAt ?? null,
    translationServerRequestReceivedAt: d.translationServerRequestReceivedAt ?? null,
    translationServerParsingDoneAt: d.translationServerParsingDoneAt ?? null,
    translationOpenAiRequestStartedAt: d.translationOpenAiRequestStartedAt ?? null,
    translationOpenAiFirstEventAt: d.translationOpenAiFirstEventAt ?? null,
    translationOpenAiFirstByteAt: d.translationOpenAiFirstByteAt ?? null,
    translationOpenAiCompletedAt: d.translationOpenAiCompletedAt ?? null,
    translationServerSerializationDoneAt: d.translationServerSerializationDoneAt ?? null,
    translationServerResponseStartedAt: d.translationServerResponseStartedAt ?? null,
    translationClientResponseFirstByteAt: d.translationClientResponseFirstByteAt ?? null,
    translationClientResponseCompletedAt: d.translationClientResponseCompletedAt ?? null,
    translationStateCommittedAt: d.translationStateCommittedAt ?? null,
    translationVisibleAt: d.translationVisibleAt ?? null,
    translationRequestCorrelationId: d.translationRequestCorrelationId ?? null,
    ttsDecisionAt: d.ttsDecisionAt ?? null,
    ttsRequested: d.ttsRequested === true,
    ttsRequestReason: d.ttsRequestReason ?? null,
    ttsGenerationOutcome: d.ttsGenerationOutcome ?? null,
    ttsPlaybackOutcome: d.ttsPlaybackOutcome ?? null,
    ttsOutcome: d.ttsOutcome ?? d.ttsGenerationOutcome ?? null,
    ttsSkipReason: d.ttsSkipReason ?? null,
    ttsRequestedAt: d.ttsRequestedAt ?? null,
    ttsStartedAt: d.ttsStartedAt ?? null,
    ttsReadyAt: d.ttsReadyAt ?? null,
    ttsClientRequestStartedAt: d.ttsClientRequestStartedAt ?? null,
    ttsRouteReceivedAt: d.ttsRouteReceivedAt ?? null,
    ttsAuthStartedAt: d.ttsAuthStartedAt ?? null,
    ttsAuthCompletedAt: d.ttsAuthCompletedAt ?? null,
    ttsAuthClientPreparationStartedAt:
      d.ttsAuthClientPreparationStartedAt ?? null,
    ttsAuthClientPreparationCompletedAt:
      d.ttsAuthClientPreparationCompletedAt ?? null,
    ttsAuthUserLookupStartedAt: d.ttsAuthUserLookupStartedAt ?? null,
    ttsAuthUserLookupCompletedAt: d.ttsAuthUserLookupCompletedAt ?? null,
    ttsBodyReadStartedAt: d.ttsBodyReadStartedAt ?? null,
    ttsBodyReadCompletedAt: d.ttsBodyReadCompletedAt ?? null,
    ttsJsonParseStartedAt: d.ttsJsonParseStartedAt ?? null,
    ttsJsonParseCompletedAt: d.ttsJsonParseCompletedAt ?? null,
    ttsValidationStartedAt: d.ttsValidationStartedAt ?? null,
    ttsValidationCompletedAt: d.ttsValidationCompletedAt ?? null,
    ttsInputNormalizationStartedAt:
      d.ttsInputNormalizationStartedAt ?? null,
    ttsInputNormalizationCompletedAt:
      d.ttsInputNormalizationCompletedAt ?? null,
    ttsServiceEnteredAt: d.ttsServiceEnteredAt ?? null,
    ttsInstructionPreparationStartedAt:
      d.ttsInstructionPreparationStartedAt ?? null,
    ttsInstructionPreparationCompletedAt:
      d.ttsInstructionPreparationCompletedAt ?? null,
    ttsOpenAiClientReadyAt: d.ttsOpenAiClientReadyAt ?? null,
    ttsServerRequestReceivedAt: d.ttsServerRequestReceivedAt ?? null,
    ttsServerParsingDoneAt: d.ttsServerParsingDoneAt ?? null,
    ttsOpenAiRequestStartedAt: d.ttsOpenAiRequestStartedAt ?? null,
    ttsOpenAiFirstByteAt: d.ttsOpenAiFirstByteAt ?? null,
    ttsOpenAiCompletedAt: d.ttsOpenAiCompletedAt ?? null,
    ttsServerFirstByteSentAt: d.ttsServerFirstByteSentAt ?? null,
    ttsServerCompletedAt: d.ttsServerCompletedAt ?? null,
    ttsClientFirstByteAt: d.ttsClientFirstByteAt ?? null,
    ttsClientResponseCompletedAt: d.ttsClientResponseCompletedAt ?? null,
    ttsAudioPreparationStartedAt: d.ttsAudioPreparationStartedAt ?? null,
    ttsAudioPreparationCompletedAt: d.ttsAudioPreparationCompletedAt ?? null,
    ttsGenerationCompletedAt: d.ttsGenerationCompletedAt ?? null,
    firstPlayableAudioAt: d.firstPlayableAudioAt ?? null,
    playRequestedAt: d.playRequestedAt ?? null,
    ttsPlaybackRequestedAt: d.ttsPlaybackRequestedAt ?? d.playRequestedAt ?? null,
    ttsRequestCorrelationId: d.ttsRequestCorrelationId ?? null,
    playbackStartedAt: d.playbackStartedAt ?? null,
    playbackCompletedAt: d.playbackCompletedAt ?? null,
    ttsPlaybackStartedAt: d.ttsPlaybackStartedAt ?? d.playbackStartedAt ?? null,
    ttsPlaybackCompletedAt: d.ttsPlaybackCompletedAt ?? d.playbackCompletedAt ?? null,
    ttsPlaybackInterruptedAt: d.ttsPlaybackInterruptedAt ?? null,
    ttsGenerationId: d.ttsGenerationId ?? null,
    ttsPlaybackAttemptId: d.ttsPlaybackAttemptId ?? null,
    ttsPlaybackFromCache: typeof d.ttsPlaybackFromCache === "boolean"
      ? d.ttsPlaybackFromCache : null,
    ttsAudioByteLength: finite(d.ttsAudioByteLength),
    ttsAudioMimeType: d.ttsAudioMimeType ?? null,
    ttsInputTextLength: finite(d.ttsInputTextLength),
    ttsPlaybackCurrentTimeAtEnd: finite(d.ttsPlaybackCurrentTimeAtEnd),
    ttsPlaybackDurationAtEnd: finite(d.ttsPlaybackDurationAtEnd),
    ttsPlaybackCurrentTimeAtInterrupt: finite(d.ttsPlaybackCurrentTimeAtInterrupt),
    ttsPlaybackDurationAtInterrupt: finite(d.ttsPlaybackDurationAtInterrupt),
    recordClickToGetUserMediaReadyMs: finite(d.recordClickToGetUserMediaReadyMs),
    recordClickToMicReadyMs: finite(d.recordClickToMicReadyMs),
    recordClickToRecordingStartedMs: finite(d.recordClickToRecordingStartedMs),
    getUserMediaToRecordingStartedMs: finite(d.getUserMediaToRecordingStartedMs),
    realtimeSetupMs: finite(d.realtimeSetupMs),
    recordingDurationMs: finite(d.recordingDurationMs),
    microphoneAcquisitionAttemptId: d.microphoneAcquisitionAttemptId ?? null,
    microphoneAcquisitionStartedAt: d.microphoneAcquisitionStartedAt ?? null,
    microphoneAcquisitionCompletedAt: d.microphoneAcquisitionCompletedAt ?? null,
    microphoneAcquisitionMs: finite(d.microphoneAcquisitionMs),
    microphoneAcquisitionOutcome: d.microphoneAcquisitionOutcome ?? null,
    captureGeneration: finite(d.captureGeneration),
    freshStreamRequested: d.freshStreamRequested === true,
    streamReused: d.streamReused === true,
    trackReadyStateAtAcquisition: d.trackReadyStateAtAcquisition ?? null,
    trackEnabledAtAcquisition:
      typeof d.trackEnabledAtAcquisition === "boolean"
        ? d.trackEnabledAtAcquisition : null,
    trackMutedAtAcquisition:
      typeof d.trackMutedAtAcquisition === "boolean"
        ? d.trackMutedAtAcquisition : null,
    mediaRecorderChunkCount: finite(d.mediaRecorderChunkCount) ?? 0,
    mediaRecorderTotalChunkBytes: finite(d.mediaRecorderTotalChunkBytes) ?? 0,
    audioBlobSize: finite(d.audioBlobSize),
    audioSignalObserved:
      typeof d.audioSignalObserved === "boolean" ? d.audioSignalObserved : null,
    audioSignalEvidence: d.audioSignalEvidence ??
      (typeof d.audioSignalObserved === "boolean" ? "measured" : "unavailable"),
    realtimeTransportReady: d.realtimeTransportReady === true,
    realtimeInputTrackGeneration: finite(d.realtimeInputTrackGeneration),
    realtimeFirstDeltaObserved: d.realtimeFirstDeltaObserved === true,
    realtimeFinalTranscriptReceived: d.realtimeFinalTranscriptReceived === true,
    capturePathOutcome: d.capturePathOutcome ?? null,
    sttRoutingDecision: input.sttRoutingDecision ?? d.sttRoutingDecision ?? null,
    primaryTranscript: sttCandidateComparison
      ? sttCandidateComparison.primary.transcript
      : d.primaryTranscript ?? null,
    primaryTranscriptionPath: d.primaryTranscriptionPath ?? null,
    primaryTranscriptionModel: d.primaryTranscriptionModel ?? null,
    rescueTranscript: sttCandidateComparison
      ? sttCandidateComparison.rescue?.transcript ?? null
      : d.rescueTranscript ?? null,
    rescueTranscriptionPath: d.rescueTranscriptionPath ?? null,
    rescueTranscriptionModel: d.rescueTranscriptionModel ?? null,
    finalTranscript: d.finalTranscript ?? input.originalText,
    finalTranscriptionPath: d.finalTranscriptionPath ?? path,
    finalTranscriptionModel: d.finalTranscriptionModel ?? input.transcriptionModel,
    primaryFailureToRescueStartMs: finite(d.primaryFailureToRescueStartMs),
    rescueTranscriptionMs: finite(d.rescueTranscriptionMs),
    rescueTranscriptToTranslationReadyMs: finite(
      d.rescueTranscriptToTranslationReadyMs,
    ),
    semanticRescueTotalMs: finite(d.semanticRescueTotalMs),
    transcriptScriptAnomalyDetected: d.transcriptScriptAnomalyDetected === true,
    trackRebindStartedAt: d.trackRebindStartedAt ?? null,
    trackRebindCompletedAt: d.trackRebindCompletedAt ?? null,
    trackRebindMs: finite(d.trackRebindMs),
    trackRebindOutcome: d.trackRebindOutcome ?? null,
    senderHadTrackBeforeRebind:
      typeof d.senderHadTrackBeforeRebind === "boolean"
        ? d.senderHadTrackBeforeRebind : null,
    connectionStateBeforeRebind: d.connectionStateBeforeRebind ?? null,
    connectionStateAfterRebind: d.connectionStateAfterRebind ?? null,
    summaryEligible: d.summaryEligible === true,
    summaryGenerated: d.summaryGenerated === true,
    summaryLength: finite(d.summaryLength) ?? 0,
    summaryCompressionRatio: finite(d.summaryCompressionRatio),
    summaryCriticalFactWarningCount:
      finite(d.summaryCriticalFactWarningCount) ?? 0,
    summaryContradictionDetected: d.summaryContradictionDetected === true,
    summaryGenerationOutcome: d.summaryGenerationOutcome ?? null,
    sttCandidateComparison,
    learningSignal: null,
    stopToTranscriptFinalMs: finite(d.stopToTranscriptFinalMs),
    transcriptFinalToTranslationReadyMs: finite(
      d.transcriptFinalToTranslationReadyMs,
    ),
    clientToTranslationServerMs: finite(d.clientToTranslationServerMs),
    translationClientToServerMs: finite(
      d.translationClientToServerMs ?? d.clientToTranslationServerMs,
    ),
    translationServerPreOpenAiMs: finite(d.translationServerPreOpenAiMs),
    translationAuthMs: finite(d.translationAuthMs),
    translationAuthClientPreparationMs: finite(
      d.translationAuthClientPreparationMs,
    ),
    translationAuthUserLookupMs: finite(d.translationAuthUserLookupMs),
    translationBodyReadMs: finite(d.translationBodyReadMs),
    translationJsonParseMs: finite(d.translationJsonParseMs),
    translationValidationMs: finite(d.translationValidationMs),
    translationNormalizationMs: finite(d.translationNormalizationMs),
    translationPromptPreparationMs: finite(
      d.translationPromptPreparationMs,
    ),
    translationSchemaPreparationMs: finite(
      d.translationSchemaPreparationMs,
    ),
    translationOpenAiClientPreparationMs: finite(
      d.translationOpenAiClientPreparationMs,
    ),
    translationOtherPreOpenAiMs: finite(d.translationOtherPreOpenAiMs),
    translationOpenAiFirstResponseMs: finite(d.translationOpenAiFirstResponseMs),
    translationOpenAiTotalMs: finite(d.translationOpenAiTotalMs),
    translationServerPostOpenAiMs: finite(d.translationServerPostOpenAiMs),
    translationServerToClientMs: finite(d.translationServerToClientMs),
    translationClientPostResponseMs: finite(d.translationClientPostResponseMs),
    transcriptFinalToTranslationRequestStartMs: finite(
      d.transcriptFinalToTranslationRequestStartMs,
    ),
    translationRequestToVisibleMs: finite(d.translationRequestToVisibleMs),
    transcriptFinalToTranslationVisibleMs: finite(
      d.transcriptFinalToTranslationVisibleMs,
    ),
    stopToTranslationVisibleMs: finite(d.stopToTranslationVisibleMs),
    translationReadyToTtsReadyMs: finite(d.translationReadyToTtsReadyMs),
    translationVisibleToTtsRequestStartMs: finite(
      d.translationVisibleToTtsRequestStartMs,
    ),
    ttsClientToServerMs: finite(d.ttsClientToServerMs),
    ttsServerPreOpenAiMs: finite(d.ttsServerPreOpenAiMs),
    ttsAuthMs: finite(d.ttsAuthMs),
    ttsAuthClientPreparationMs: finite(d.ttsAuthClientPreparationMs),
    ttsAuthUserLookupMs: finite(d.ttsAuthUserLookupMs),
    ttsBodyReadMs: finite(d.ttsBodyReadMs),
    ttsJsonParseMs: finite(d.ttsJsonParseMs),
    ttsValidationMs: finite(d.ttsValidationMs),
    ttsNormalizationMs: finite(d.ttsNormalizationMs),
    ttsInstructionPreparationMs: finite(d.ttsInstructionPreparationMs),
    ttsOpenAiClientPreparationMs: finite(d.ttsOpenAiClientPreparationMs),
    ttsOtherPreOpenAiMs: finite(d.ttsOtherPreOpenAiMs),
    combinedPreOpenAiMs: combinedPreOpenAiMs(
      d.translationServerPreOpenAiMs,
      d.ttsServerPreOpenAiMs,
    ),
    ttsOpenAiTimeToFirstByteMs: finite(d.ttsOpenAiTimeToFirstByteMs),
    ttsOpenAiTotalMs: finite(d.ttsOpenAiTotalMs),
    ttsServerStreamingOverheadMs: finite(d.ttsServerStreamingOverheadMs),
    ttsServerToClientFirstByteMs: finite(d.ttsServerToClientFirstByteMs),
    ttsClientDownloadTotalMs: finite(d.ttsClientDownloadTotalMs),
    ttsAudioPreparationMs: finite(d.ttsAudioPreparationMs),
    ttsPlayCallToStartedMs: finite(d.ttsPlayCallToStartedMs),
    translationReadyToPlaybackStartedMs: finite(
      d.translationReadyToPlaybackStartedMs,
    ),
    translationReadyToFirstPlayableAudioMs: finite(
      d.translationReadyToFirstPlayableAudioMs,
    ),
    translationVisibleToFirstPlayableAudioMs: finite(
      d.translationVisibleToFirstPlayableAudioMs,
    ),
    stopToFirstPlayableAudioMs: finite(d.stopToFirstPlayableAudioMs),
    ttsRequestToReadyMs: finite(d.ttsRequestToReadyMs),
    stopToTtsReadyMs: finite(d.stopToTtsReadyMs),
    ttsReadyToPlaybackStartedMs: finite(d.ttsReadyToPlaybackStartedMs),
    stopToPlaybackStartedMs: finite(d.stopToPlaybackStartedMs),
    interactionOverheadMs: finite(d.interactionOverheadMs),
    serverTranscriptionMs:
      path === "audio_upload_fallback" ? finite(d.transcriptionMs) : null,
    serverTranslationMs: finite(d.translationMs ?? d.autoTranslateMs),
    serverTranslationTotalMs: finite(d.serverTranslationTotalMs),
    translationRequestMs: finite(d.translationRequestMs),
    ttsGenerationMs: finite(d.ttsGenerationMs),
    ttsRequestMs: finite(d.ttsRequestMs ?? d.ttsRequestToReadyMs),
    autoplayEnabled: d.autoplayEnabled === true,
    translationStreamingUsed: d.translationStreamingUsed === true,
    ttsStreamingUsed: d.ttsStreamingUsed === true,
    earlyTtsUsed: d.earlyTtsUsed === true,
    streamingFallbackReason: d.streamingFallbackReason ?? null,
    criticalPath: buildCriticalPath(d),
    performanceBudgetViolations: budgetViolations(d),
    transcriptionPathDecisionAt: d.transcriptionPathDecisionAt ?? null,
    transcriptionPathDecisionReason:
      d.transcriptionPathDecisionReason ?? d.fallbackReason ?? null,
    feedbackRating: input.feedback?.feedbackRating ?? null,
    feedbackCategories: input.feedback
      ? [...input.feedback.feedbackCategories]
      : null,
    feedbackComment: input.feedback?.feedbackComment ?? null,
    feedbackType: input.feedback?.feedbackType ?? null,
    speechFeedbackStatus: input.feedback?.speechFeedbackStatus ?? null,
    translationFeedback: input.feedback?.translationFeedback ?? null,
    ttsFeedback: input.feedback?.ttsFeedback ?? null,
    feedbackPersistenceStatus: input.feedback?.persistenceStatus ?? null,
    errorStage: primaryEvent?.stage ?? input.errorStage,
    errorType: input.errorType,
    errorCode: input.errorCode,
    sanitizedErrorMessage: input.sanitizedErrorMessage
      ? sanitizeClassicReportError(input.sanitizedErrorMessage)
      : null,
    stateBeforeRecording: input.incident?.stateBeforeRecording ?? null,
    stateAtFailure: input.incident?.stateAtFailure ?? null,
    stateAfterCleanup: input.incident?.stateAfterCleanup ?? null,
    recorderStatusBefore: input.incident?.recorderStatusBefore ?? null,
    recorderStatusAtFailure: input.incident?.recorderStatusAtFailure ?? null,
    recorderStatusAfterCleanup: input.incident?.recorderStatusAfterCleanup ?? null,
    realtimeManagerStateBefore: input.incident?.realtimeManagerStateBefore ?? null,
    realtimeManagerStateAtFailure: input.incident?.realtimeManagerStateAtFailure ?? null,
    realtimeManagerStateAfterCleanup: input.incident?.realtimeManagerStateAfterCleanup ?? null,
    endpoint: primaryEvent?.endpoint ?? input.incident?.endpoint ?? null,
    httpStatus: finite(primaryEvent?.httpStatus ?? input.incident?.httpStatus),
    apiErrorCode: primaryEvent?.apiCode ?? input.incident?.apiErrorCode ?? null,
    failureCategory: primaryEvent?.category ?? input.incident?.failureCategory ?? null,
    retryable: primaryEvent?.retryable ?? input.incident?.retryable === true,
    recoveryAction: primaryEvent?.recoveryAction ?? input.incident?.recoveryAction ?? "none",
    recoverySucceeded: primaryEvent?.recoverySucceeded ?? input.incident?.recoverySucceeded ?? null,
    audioBlobAvailable:
      input.audioBlobAvailable === true || input.incident?.audioBlobAvailable === true,
    authCheckAttempted: attemptedAuth.length > 0,
    authCheckSucceeded: attemptedAuth.length === 0
      ? null
      : attemptedAuth.every((auth) => auth.succeeded === true),
    authFailureType:
      attemptedAuth.find((auth) => auth.failureType)?.failureType ?? null,
    recognizedTranscript: input.quality?.recognizedTranscript ?? null,
    correctedTranscript: input.quality?.correctedTranscript ?? null,
    transcriptCorrected: input.quality?.transcriptCorrected === true,
    correctedTranslation: input.quality?.correctedTranslation ?? null,
    audioIncludedInDiagnosticBundle:
      input.audioIncludedInDiagnosticBundle === true ||
      input.quality?.audioIncludedInDiagnosticBundle === true,
    audioSharedRemotely: false,
    diagnosticEvents,
    consentAtRecordingStart: input.consent?.consentAtRecordingStart ?? null,
    consentAtTurnFinalization: input.consent?.consentAtTurnFinalization ?? null,
    translationAuthDiagnostic,
    ttsAuthDiagnostic,
    recognitionReviewStatus: input.quality?.recognitionReviewStatus ?? null,
    speechQualitySampleId: input.quality?.sampleId ?? null,
    speechAudioEligibleForTurn: input.consent
      ? speechAudioEligibleForTurn(input.consent)
      : input.quality?.audioEligible === true,
    audioMetadata: {
      mimeType: input.quality?.audioMetadata.mimeType ?? input.audio.audioMimeType,
      sizeBytes: input.quality?.audioMetadata.sizeBytes ?? input.audio.audioSize,
      durationMs:
        input.quality?.audioMetadata.durationMs ??
        finite(input.audio.durationMs ?? d.recordingDurationMs),
      sampleRate: input.quality?.audioMetadata.sampleRate ?? input.audio.sampleRate ?? null,
      channelCount:
        input.quality?.audioMetadata.channelCount ?? input.audio.channelCount ?? null,
    },
    audioQualityMetrics: audioQualityWithEvidence(
      input.quality?.audioQualityMetrics ?? input.audio.audioQualityMetrics,
    ),
    sameAudioBenchmarkAttempted: input.sameAudioBenchmark !== null && input.sameAudioBenchmark !== undefined,
    sameAudioBenchmarkCompleted: input.sameAudioBenchmark?.benchmarkStatus === "completed",
    secondaryTranscriptionModel: input.sameAudioBenchmark?.secondaryEngine ?? null,
    secondaryTranscriptionMs: input.sameAudioBenchmark?.secondaryTranscriptionMs ?? null,
    secondaryBenchmarkMs: input.sameAudioBenchmark?.secondaryTranscriptionMs ?? null,
    benchmarkReviewStatus: input.sameAudioBenchmark?.groundTruthStatus ?? null,
    benchmarkGroundTruthAvailable: Boolean(input.sameAudioBenchmark?.groundTruthTranscript),
    primaryWer: input.sameAudioBenchmark?.primaryWer ?? null,
    secondaryWer: input.sameAudioBenchmark?.secondaryWer ?? null,
    sameAudioBenchmark,
  };
}

export function buildClassicTranslatorReport(input: {
  reportId?: string;
  startedAt: string;
  exportedAt?: string;
  userAgent: string;
  platform: string;
  currentMode: TranslationMode;
  ttsSpeed: number;
  entries: TranslationEntry[];
  failedTurns: ClassicTranslatorFailedTurn[];
  audioMetadataByTurn?: ReadonlyMap<string, ClassicTranslatorAudioMetadata>;
  feedbackByTurn?: ReadonlyMap<string, ClassicTranslatorLocalFeedback>;
  connectionAttempts?: ClassicRealtimeConnectionAttempt[];
  connectionAttemptsTotal?: number;
  connectionSuccesses?: number;
  connectionFailures?: number;
  reconnectCount?: number;
  realtimeConnectionStateTimeline?: ClassicRealtimeConnectionStateTimelineEntry[];
  realtimeFinalizationFailureCount?: number;
  realtimeCircuitBreakerTrips?: number;
  realtimeSemanticFailureStreak?: number;
  realtimeSemanticCircuitBreakerTrips?: number;
  realtimeSemanticCircuitBreakerTurnsRemaining?: number;
  realtimeSemanticProbePending?: boolean;
  buildMetadata?: TranslatorBuildMetadata;
  diagnosticsSettings?: TranslatorDiagnosticsSettings;
  installationId?: string | null;
  sessionId?: string | null;
  qualityByTurn?: ReadonlyMap<string, TranslatorSpeechQualitySample>;
  recoveryByTurn?: ReadonlyMap<string, ClassicTranslatorRecoveryRecord>;
  audioIncludedInDiagnosticBundleByTurn?: ReadonlySet<string>;
  audioBlobAvailableByTurn?: ReadonlySet<string>;
  diagnosticEventsByTurn?: ReadonlyMap<string, TranslatorDiagnosticEvent[]>;
  consentByTurn?: ReadonlyMap<string, TranslatorTurnConsent>;
  consentEvents?: TranslatorConsentEvent[];
  sttRoutingByTurn?: ReadonlyMap<string, SttRoutingDecision>;
  sttComparisonsByTurn?: ReadonlyMap<string, SttCandidateComparison>;
  sameAudioBenchmarksByTurn?: ReadonlyMap<string, SameAudioBenchmarkComparison>;
  sameAudioEligibleTurnIds?: ReadonlySet<string>;
  persistedSnapshotUsed?: boolean;
  droppedTelemetryEvents?: number;
  audioManifestConsistent?: boolean | null;
  recordingStartAttempts?: RecordingStartAttempt[];
  activeRecordingStartAttempt?: (RecordingStartAttempt & { ageMs: number }) | null;
}) {
  const sourceConnectionAttempts = input.connectionAttempts ?? [];
  const successfulTurns = input.entries.map((entry) => {
    const diagnostics: Partial<TranslationDiagnostics> = entry.diagnostics ?? {};
    const legacyRecovery = input.recoveryByTurn?.get(entry.id) ?? null;
    const diagnosticEvents = input.diagnosticEventsByTurn?.get(entry.id) ??
      (legacyRecovery
        ? [legacyDiagnosticEvent({
            turnId: entry.id,
            at: new Date(entry.timestamp).toISOString(),
            status: "success",
            incident: legacyRecovery,
          })]
        : []);
    return turnFromValues({
      turnId: entry.id,
      createdAt: new Date(entry.timestamp).toISOString(),
      status: "success",
      mode: modeForEntry(entry),
      sourceLanguage: entry.sourceLanguage,
      targetLanguage: entry.targetLanguage,
      originalText: entry.originalText,
      translatedText: entry.translatedText,
      essenceSummary: entry.essenceSummary ?? null,
      diagnostics,
      audio: input.audioMetadataByTurn?.get(entry.id) ?? {
        audioMimeType: null,
        audioSize: null,
      },
      transcriptionModel: diagnostics.transcriptionModel ?? null,
      translationModel: diagnostics.translationModel ?? null,
      ttsModel: diagnostics.ttsModel ?? null,
      ttsSpeed: diagnostics.ttsSpeed ?? input.ttsSpeed,
      feedback: input.feedbackByTurn?.get(entry.id) ?? null,
      errorStage: null,
      errorType: null,
      errorCode: null,
      sanitizedErrorMessage: null,
      incident: input.recoveryByTurn?.get(entry.id) ?? null,
      quality: input.qualityByTurn?.get(entry.id) ?? null,
      audioIncludedInDiagnosticBundle:
        input.audioIncludedInDiagnosticBundleByTurn?.has(entry.id) === true,
      audioBlobAvailable: input.audioBlobAvailableByTurn?.has(entry.id) === true,
      diagnosticEvents,
      consent: input.consentByTurn?.get(entry.id) ?? null,
      sttRoutingDecision: input.sttRoutingByTurn?.get(entry.id) ?? null,
      sttCandidateComparison: input.sttComparisonsByTurn?.get(entry.id) ?? null,
      sameAudioBenchmark: input.sameAudioBenchmarksByTurn?.get(entry.id) ?? null,
    });
  });
  const failedTurns = input.failedTurns.map((turn) => {
    const incident = {
      ...turn,
      failureCategory: turn.failureCategory ?? "UNKNOWN",
      apiErrorCode: turn.apiErrorCode ?? turn.errorCode,
      retryable: turn.retryable ?? false,
      recoveryAction: turn.recoveryAction ?? "reset_to_idle",
      recoverySucceeded: turn.recoverySucceeded ?? null,
    };
    const diagnosticEvents = input.diagnosticEventsByTurn?.get(turn.turnId) ??
      turn.diagnosticEvents ?? [legacyDiagnosticEvent({
        turnId: turn.turnId,
        at: turn.createdAt,
        status: "failed",
        incident,
      })];
    return turnFromValues({
      turnId: turn.turnId,
      createdAt: turn.createdAt,
      status: "failed",
      mode: turn.mode,
      sourceLanguage: turn.sourceLanguage ?? null,
      targetLanguage: turn.targetLanguage ?? null,
      originalText: turn.originalText ?? null,
      translatedText: turn.translatedText ?? null,
      essenceSummary: null,
      diagnostics: turn.diagnostics,
      audio: input.audioMetadataByTurn?.get(turn.turnId) ?? {
        audioMimeType: turn.audioMimeType ?? null,
        audioSize: turn.audioSize ?? null,
      },
      transcriptionModel:
        turn.transcriptionModel ?? turn.diagnostics.transcriptionModel ?? null,
      translationModel:
        turn.translationModel ?? turn.diagnostics.translationModel ?? null,
      ttsModel: turn.ttsModel ?? turn.diagnostics.ttsModel ?? null,
      ttsSpeed: turn.ttsSpeed,
      feedback: input.feedbackByTurn?.get(turn.turnId) ?? null,
      errorStage: turn.errorStage,
      errorType: turn.errorType ?? "Error",
      errorCode: turn.errorCode,
      sanitizedErrorMessage: turn.sanitizedErrorMessage,
      incident,
      quality: input.qualityByTurn?.get(turn.turnId) ?? null,
      audioIncludedInDiagnosticBundle:
        input.audioIncludedInDiagnosticBundleByTurn?.has(turn.turnId) === true,
      audioBlobAvailable:
        input.audioBlobAvailableByTurn?.has(turn.turnId) === true ||
        turn.audioBlobAvailable === true,
      diagnosticEvents,
      consent: input.consentByTurn?.get(turn.turnId) ?? null,
      sttRoutingDecision: input.sttRoutingByTurn?.get(turn.turnId) ?? null,
      sttCandidateComparison: input.sttComparisonsByTurn?.get(turn.turnId) ?? null,
      sameAudioBenchmark: input.sameAudioBenchmarksByTurn?.get(turn.turnId) ?? null,
    });
  });
  const turns = [...successfulTurns, ...failedTurns].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
  const successful = turns.filter((turn) => turn.status === "success");
  const realtime = successful.filter((turn) => turn.transcriptionPath === "realtime");
  const fallback = successful.filter(
    (turn) => turn.transcriptionPath === "audio_upload_fallback",
  );
  const warmRealtime = realtime.filter(
    (turn) => turn.realtimeConnectionReused && turn.warmStart,
  );
  const realtimeAll = turns.filter((turn) => turn.transcriptionPath === "realtime");
  const fallbackAll = turns.filter(
    (turn) => turn.transcriptionPath === "audio_upload_fallback",
  );
  const warmRealtimeAll = realtimeAll.filter(
    (turn) => turn.realtimeConnectionReused && turn.warmStart,
  );
  const pathDecidedTurns = realtimeAll.length + fallbackAll.length;
  const fallbackReasons = turns.reduce<Record<string, number>>((counts, turn) => {
    if (!turn.fallbackReason) return counts;
    counts[turn.fallbackReason] = (counts[turn.fallbackReason] ?? 0) + 1;
    return counts;
  }, {});
  const turnModes = new Set(turns.map((turn) => turn.translatorMode));
  const transcriptionModels = Array.from(
    new Set(
      turns
        .map((turn) => turn.transcriptionModel)
        .filter((model): model is string => Boolean(model)),
    ),
  );
  const connectionAttempts = sourceConnectionAttempts.map((attempt) => ({
    ...attempt,
    sanitizedErrorMessage: attempt.sanitizedErrorMessage
      ? sanitizeClassicReportError(attempt.sanitizedErrorMessage)
      : null,
  }));
  const ttsStreamingTurns = successful.filter((turn) => turn.ttsStreamingUsed);
  const nonStreamingTtsTurns = successful.filter(
    (turn) => !turn.ttsStreamingUsed && turn.ttsStartedAt !== null,
  );
  const streamingFallbackTurns = turns.filter(
    (turn) => turn.streamingFallbackReason !== null,
  );
  const streamingFallbackReasons = streamingFallbackTurns.reduce<Record<string, number>>(
    (counts, turn) => {
      const reason = turn.streamingFallbackReason;
      if (reason) counts[reason] = (counts[reason] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const initialRealtimeSetupMs = finite(
    sourceConnectionAttempts.find((attempt) => attempt.status === "success")
      ?.totalSetupMs,
  );
  const diagnosticEvents = turns.flatMap((turn) => turn.diagnosticEvents);
  const failureEvents = diagnosticEvents.filter((event) => event.eventKind === "failure");
  const countEventsBy = (
    events: TranslatorDiagnosticEvent[],
    selector: (event: TranslatorDiagnosticEvent) => string | null,
  ) => events.reduce<Record<string, number>>((counts, event) => {
      const key = selector(event);
      if (key) counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
  const recoveryAttempts = diagnosticEvents.filter(
    (event) => event.recoveryAction !== "none",
  ).length;
  const isReviewed = (turn: (typeof turns)[number]) =>
    turn.recognitionReviewStatus === "accepted" ||
    turn.recognitionReviewStatus === "corrected";
  const reviewedQualityTurns = turns.filter(isReviewed);
  const qaScenariosTriggered = Array.from(new Set(diagnosticEvents
    .filter((event) => event.eventOrigin === "qa_simulation" && event.qaScenarioId)
    .map((event) => event.qaScenarioId as string)));
  const qaScenariosRecovered = Array.from(new Set(turns.flatMap((turn) =>
    turn.status === "success"
      ? turn.diagnosticEvents.flatMap((event) =>
          event.eventOrigin === "qa_simulation" &&
          event.qaScenarioId &&
          event.recoverySucceeded === true
            ? [event.qaScenarioId]
            : [])
      : [])));
  const organicTurns = turns.filter((turn) =>
    !turn.diagnosticEvents.some((event) => event.eventOrigin === "qa_simulation"),
  );
  const qaTurns = turns.filter((turn) =>
    turn.diagnosticEvents.some((event) => event.eventOrigin === "qa_simulation"),
  );
  const qaEvents = diagnosticEvents.filter((event) =>
    event.eventOrigin === "qa_simulation");
  const organicSuccessfulTurns = organicTurns.filter((turn) =>
    turn.status === "success");
  const organicFailedTurns = organicTurns.filter((turn) =>
    turn.status === "failed");
  const reviewedOrganicQualityTurns = organicTurns.filter(isReviewed);
  const userPerceived = metricSummary(
    organicSuccessfulTurns
      .filter((turn) => turn.autoplayEnabled)
      .map((turn) => turn.stopToPlaybackStartedMs),
  );
  const translationPreOpenAi = metricSummary(
    organicSuccessfulTurns.map((turn) => turn.translationServerPreOpenAiMs),
  );
  const ttsPreOpenAi = metricSummary(
    organicSuccessfulTurns.map((turn) => turn.ttsServerPreOpenAiMs),
  );
  const combinedPreOpenAi = metricSummary(
    organicSuccessfulTurns.map((turn) => turn.combinedPreOpenAiMs),
  );
  const buildMetadata = input.buildMetadata ?? {
    appVersion: "unknown",
    buildVersion: "unknown",
    gitCommitSha: null,
    deploymentId: null,
    vercelEnvironment: null,
    frontendRuntimeEnvironment: "development" as const,
    frontendOriginKind: "unknown" as const,
    backendEnvironmentLabel: "unknown" as const,
    environment: "development" as const,
  };
  const settings = input.diagnosticsSettings ?? {
    diagnosticsSharingEnabled: false,
    qualityContentSharingEnabled: false,
    speechSampleSharingEnabled: false,
    internalQaModeEnabled: false,
  };
  const comparisons = turns.flatMap((turn) =>
    turn.sttCandidateComparison ? [turn.sttCandidateComparison] : []);
  const benchmarkComparisons = Array.from(input.sameAudioBenchmarksByTurn?.values() ?? []);
  const speechBenchmarkSummary = summarizeSpeechBenchmarks(
    benchmarkComparisons,
    input.sameAudioEligibleTurnIds?.size ?? benchmarkComparisons.length,
  );
  for (const turn of turns) {
    const comparison = turn.sttCandidateComparison;
    const evidenceOrigin = turn.diagnosticEvents.some((event) =>
      event.eventOrigin === "qa_simulation")
      ? "qa_simulation" as const
      : "organic_runtime" as const;
    const sameAudioComparisonAvailable = Boolean(
      comparison?.rescue || turn.sameAudioBenchmark?.benchmarkStatus === "completed",
    );
    const audioAvailable = turn.audioBlobAvailable;
    const signalQuality = learningSignalQuality({
      sameAudioComparisonAvailable,
      reviewStatus: turn.recognitionReviewStatus,
      audioAvailable,
    });
    turn.learningSignal = {
      turnId: turn.turnId,
      createdAt: turn.createdAt,
      buildMetadata,
      sourceLanguage: turn.sourceLanguage,
      targetLanguage: turn.targetLanguage,
      routingDecision: turn.sttRoutingDecision ??
        (turn.transcriptionPath === "realtime" ? "realtime_primary" : "audio_fallback_cold"),
      primaryModel: turn.primaryTranscriptionModel ?? turn.transcriptionModel,
      primaryPath: turn.primaryTranscriptionPath ?? turn.transcriptionPath,
      rescueModel: turn.rescueTranscriptionModel,
      rescuePath: turn.rescueTranscriptionPath,
      diagnosticCodes: turn.diagnosticEvents.flatMap((event) =>
        event.apiCode ? [event.apiCode] : []),
      audioQualityMetrics: turn.audioQualityMetrics,
      recognitionReviewStatus: turn.recognitionReviewStatus,
      correctionAvailable: turn.correctedTranscript !== null,
      sameAudioComparisonAvailable,
      userFeedbackAvailable: turn.feedbackRating !== null,
      consentSnapshot: turn.consentAtRecordingStart,
      signalQuality,
      benchmarkReadySameAudioSample: signalQuality === "high",
      criticalFactCategories: turn.originalText
        ? detectCriticalFactCategories(turn.originalText)
        : [],
      evidenceOrigin,
    };
  }
  const semanticRescueTurns = organicTurns.filter((turn) =>
    turn.sttRoutingDecision === "audio_rescue_semantic_failure");
  const semanticRescueSuccesses = semanticRescueTurns.filter((turn) =>
    turn.status === "success").length;
  const safePathTurns = organicTurns.filter((turn) =>
    turn.sttRoutingDecision === "audio_safe_mode_circuit_breaker");
  const featureFlagSafePathTurns = organicTurns.filter((turn) =>
    turn.sttRoutingDecision === "audio_safe_mode_feature_flag");
  const coldFallbackTurns = organicTurns.filter((turn) =>
    turn.fallbackReason === "realtime_not_ready_at_recording_start");
  const connectionLossFallbackTurns = organicTurns.filter((turn) =>
    turn.fallbackReason === "connection_lost_during_recording" ||
    turn.sttRoutingDecision === "audio_fallback_connection_loss");
  const realtimeEligibleTurns = organicTurns.filter((turn) =>
    turn.sttRoutingDecision !== "audio_safe_mode_feature_flag" &&
    turn.sttRoutingDecision !== "audio_safe_mode_circuit_breaker");
  const realtimeAttemptedTurns = realtimeEligibleTurns.filter((turn) =>
    turn.sttRoutingDecision === "realtime_primary" ||
    turn.realtimeConnectionReused ||
    connectionLossFallbackTurns.includes(turn) ||
    ["empty_transcript", "transcript_timeout", "transcript_not_finalized"]
      .includes(turn.fallbackReason ?? ""));
  const realtimeSuccessfulTurns = organicSuccessfulTurns.filter((turn) =>
    turn.sttRoutingDecision === "realtime_primary");
  const recoveredDegradationTurns = organicSuccessfulTurns.filter((turn) =>
    connectionLossFallbackTurns.includes(turn) ||
    turn.sttRoutingDecision === "audio_rescue_semantic_failure" ||
    turn.diagnosticEvents.some((event) =>
      event.eventOrigin === "organic_runtime" &&
      event.recoverySucceeded === true &&
      (event.recoveryAction === "audio_upload_fallback" ||
        event.recoveryAction === "retry_translation_once") &&
      event.eventKind !== "expected_fallback"));
  const organicFallbackTurns = organicTurns.filter((turn) =>
    turn.transcriptionPath === "audio_upload_fallback");
  const organicFallbackSuccesses = organicFallbackTurns.filter((turn) =>
    turn.status === "success");
  const organicFallbackReasons = organicTurns.reduce<Record<string, number>>(
    (counts, turn) => {
      if (turn.fallbackReason) {
        counts[turn.fallbackReason] = (counts[turn.fallbackReason] ?? 0) + 1;
      }
      return counts;
    },
    {},
  );
  const fallbackRecoveryTurns = organicFallbackTurns.filter((turn) =>
    !coldFallbackTurns.includes(turn) &&
    !featureFlagSafePathTurns.includes(turn) &&
    !safePathTurns.includes(turn));
  const fallbackRecoverySuccesses = fallbackRecoveryTurns.filter((turn) =>
    turn.status === "success");
  const webKitEnvironment = /(?:iPhone|iPad|iPod)|AppleWebKit/i.test(input.userAgent) &&
    !/(?:Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|OPiOS)/i.test(input.userAgent);
  const webKitSafeModeTurns = webKitEnvironment ? featureFlagSafePathTurns : [];
  const summaryEligibleTurns = organicTurns.filter((turn) => turn.summaryEligible);
  const summaryGeneratedTurns = organicTurns.filter((turn) => turn.summaryGenerated);
  const organicUnsupportedLanguageEvents = diagnosticEvents.filter((event) =>
    event.eventOrigin === "organic_runtime" &&
    event.apiCode === "unsupported_language" &&
    event.eventKind === "degradation" &&
    event.stage === "semantic_translation_validation");
  const organicFailureCodes = organicFailedTurns.flatMap((turn) => {
    const event = turn.diagnosticEvents.find((candidate) =>
      candidate.eventOrigin === "organic_runtime" && candidate.eventKind === "failure");
    return event?.apiCode ? [event.apiCode] : [];
  });
  const topOrganicFailureCode = Object.entries(
    organicFailureCodes.reduce<Record<string, number>>((counts, code) => {
      counts[code] = (counts[code] ?? 0) + 1;
      return counts;
    }, {}),
  ).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
  const recordingStartAttempts = input.recordingStartAttempts ?? [];
  const activeRecordingStartAttempt = input.activeRecordingStartAttempt ?? null;
  const recordingStartTimeouts = recordingStartAttempts.filter((attempt) =>
    attempt.outcome === "timeout");
  const recordingStartFailures = recordingStartAttempts.filter((attempt) =>
    attempt.outcome !== null && attempt.outcome !== "recording_started");
  const activeRecordingStartStuck = Boolean(
    activeRecordingStartAttempt &&
    activeRecordingStartAttempt.ageMs >= RECORDING_START_STUCK_THRESHOLD_MS,
  );
  const preTurnIncidentCount = recordingStartFailures.length +
    (activeRecordingStartStuck ? 1 : 0);
  const recordingStartOutcomeCounts = recordingStartAttempts.reduce<Record<string, number>>(
    (counts, attempt) => {
      if (attempt.outcome) counts[attempt.outcome] = (counts[attempt.outcome] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const recommendedQaFocus = [
    ...(preTurnIncidentCount > 0 ? ["mic_start_reliability"] : []),
    ...(turns.some((turn) => turn.microphoneAcquisitionOutcome === "timeout")
      ? ["microphone_acquisition"] : []),
    ...(turns.some((turn) => turn.capturePathOutcome === "invalid_audio_capture")
      ? ["audio_capture_integrity"] : []),
    ...(organicUnsupportedLanguageEvents.length > 0
      ? ["realtime_semantic_accuracy"] : []),
    ...(semanticRescueTurns.length > semanticRescueSuccesses
      ? ["semantic_rescue_failures"] : []),
  ];
  const connectionTimelineItems = (input.realtimeConnectionStateTimeline ?? [])
    .flatMap((event, index) => {
      const stage = event.event === "temporary_disconnect"
        ? "temporary_disconnect"
        : event.event === "disconnect_recovered"
          ? "disconnect_recovered"
          : event.event === "connection_error"
            ? "connection_lost"
            : null;
      return stage ? [{
        turnId: null,
        at: event.at,
        eventId: `webrtc-${index}-${stage}`,
        eventOrigin: "organic_runtime" as const,
        eventKind: stage === "connection_lost"
          ? "degradation" as const : "info" as const,
        stage,
        apiCode: null,
        recoveryAction: stage === "connection_lost"
          ? "audio_upload_fallback" as const : "none" as const,
        recoverySucceeded: null,
        qaScenarioId: null,
      }] : [];
    });
  const recordingStartTimelineItems = recordingStartAttempts.flatMap((attempt) =>
    attempt.timeline.map((event, index) => ({
      turnId: null,
      at: event.at,
      eventId: `recording-start-${attempt.attemptId}-${index}`,
      eventOrigin: "organic_runtime" as const,
      eventKind: event.phase === "timeout" ||
        (event.phase === "cleanup_completed" && attempt.outcome !== "recording_started")
        ? "degradation" as const : "info" as const,
      stage: event.phase === "user_click" ? "recording_start_clicked" : event.phase,
      apiCode: event.phase === "timeout" ? "recording_start_timeout" : null,
      recoveryAction: event.phase === "timeout"
        ? "reset_to_idle" as const : "none" as const,
      recoverySucceeded: event.phase === "cleanup_completed" &&
        attempt.outcome !== "recording_started" ? true : null,
      qaScenarioId: null,
    })),
  );
  const incidentTimeline = [...turns.flatMap((turn) => {
    const qaEvent = turn.diagnosticEvents.find((event) =>
      event.eventOrigin === "qa_simulation");
    const qaScenarioId = qaEvent?.qaScenarioId ?? null;
    const eventOrigin = qaEvent
      ? "qa_simulation" as const
      : "organic_runtime" as const;
    const diagnosticItems = turn.diagnosticEvents.flatMap((event) => {
      const code = event.apiCode ?? "";
      const relevant = event.eventKind !== "expected_fallback" ||
        code === "realtime_not_ready_at_recording_start" ||
        /timeout|invalid_audio|realtime|rescue|unsupported_language|tts|translation/.test(code);
      return relevant ? [{
        turnId: turn.turnId,
        at: event.at,
        eventId: event.eventId,
        eventOrigin: event.eventOrigin,
        eventKind: event.eventKind,
        stage: event.stage,
        apiCode: event.apiCode,
        recoveryAction: event.recoveryAction,
        recoverySucceeded: event.recoverySucceeded,
        qaScenarioId: event.qaScenarioId,
      }] : [];
    });
    const synthetic = [
      ...(turn.trackRebindStartedAt ? [{
        turnId: turn.turnId,
        at: turn.trackRebindStartedAt,
        eventId: `track-rebind-started-${turn.turnId}`,
        eventOrigin,
        eventKind: "info" as const,
        stage: "track_rebind_started",
        apiCode: null,
        recoveryAction: "none" as const,
        recoverySucceeded: null,
        qaScenarioId,
      }] : []),
      ...(turn.trackRebindCompletedAt ? [{
        turnId: turn.turnId,
        at: turn.trackRebindCompletedAt,
        eventId: `track-rebind-completed-${turn.turnId}`,
        eventOrigin,
        eventKind: "info" as const,
        stage: "track_rebind_completed",
        apiCode: turn.trackRebindOutcome ?? null,
        recoveryAction: "none" as const,
        recoverySucceeded: turn.trackRebindOutcome === "success" ||
          turn.trackRebindOutcome === "temporary_disconnect_recovered",
        qaScenarioId,
      }] : []),
      ...(turn.summaryGenerated && turn.translationReadyAt ? [{
        turnId: turn.turnId,
        at: turn.translationReadyAt,
        eventId: `summary-generated-${turn.turnId}`,
        eventOrigin,
        eventKind: "info" as const,
        stage: "summary_generated",
        apiCode: null,
        recoveryAction: "none" as const,
        recoverySucceeded: null,
        qaScenarioId,
      }] : []),
      ...(turn.summaryCriticalFactWarningCount > 0 && turn.translationReadyAt ? [{
        turnId: turn.turnId,
        at: turn.translationReadyAt,
        eventId: `summary-warning-${turn.turnId}`,
        eventOrigin,
        eventKind: "degradation" as const,
        stage: "summary_warning",
        apiCode: "summary_critical_fact_guard",
        recoveryAction: "none" as const,
        recoverySucceeded: null,
        qaScenarioId,
      }] : []),
      ...(turn.transcriptionPath === "audio_upload_fallback" &&
      turn.recordingStoppedAt ? [{
        turnId: turn.turnId,
        at: turn.recordingStoppedAt,
        eventId: `fallback-started-${turn.turnId}`,
        eventOrigin,
        eventKind: "info" as const,
        stage: "fallback_started",
        apiCode: turn.fallbackReason,
        recoveryAction: "audio_upload_fallback" as const,
        recoverySucceeded: null,
        qaScenarioId,
      }] : []),
      ...(turn.transcriptionPath === "audio_upload_fallback" &&
      turn.status === "success" && turn.translationReadyAt ? [{
        turnId: turn.turnId,
        at: turn.translationReadyAt,
        eventId: `fallback-success-${turn.turnId}`,
        eventOrigin,
        eventKind: "info" as const,
        stage: "fallback_success",
        apiCode: turn.fallbackReason,
        recoveryAction: "audio_upload_fallback" as const,
        recoverySucceeded: true,
        qaScenarioId,
      }] : []),
    ];
    return [...diagnosticItems, ...synthetic];
  }), ...connectionTimelineItems, ...recordingStartTimelineItems]
    .sort((left, right) => left.at.localeCompare(right.at));

  const realtimeAttemptSuccessRate = rate(
    realtimeSuccessfulTurns.length,
    realtimeAttemptedTurns.length,
  );
  const productTurnSuccessRate = rate(
    organicSuccessfulTurns.length,
    organicTurns.length,
  );
  const sessionTurnSuccessRate = rate(successful.length, turns.length);
  const primaryPathSuccessRate = realtimeAttemptSuccessRate;
  const fallbackRecoveryRate = rate(
    fallbackRecoverySuccesses.length,
    fallbackRecoveryTurns.length,
  );
  const audioFallbackSuccesses = fallbackAll.filter((turn) =>
    turn.status === "success").length;
  const organicDiagnosticEvents = organicTurns.flatMap((turn) =>
    turn.diagnosticEvents.filter((event) => event.eventOrigin === "organic_runtime"));
  const organicRealtimeFailureEvents = organicDiagnosticEvents.filter((event) =>
    event.category === "REALTIME" &&
    event.eventKind !== "expected_fallback" &&
    (event.eventKind === "failure" || event.eventKind === "degradation"));
  const realtimeStabilityFailure = connectionLossFallbackTurns.length > 0 ||
    organicRealtimeFailureEvents.some((event) =>
      event.stage === "realtime_finalization" ||
      event.stage === "connection_lost" ||
      event.apiCode === "connection_lost_during_recording") ||
    (input.realtimeCircuitBreakerTrips ?? 0) > 0 ||
    (realtimeAttemptedTurns.length >= 3 && realtimeAttemptSuccessRate !== null &&
      realtimeAttemptSuccessRate < 0.9);
  const autoplayEnabledTurns = organicSuccessfulTurns.filter((turn) =>
    turn.autoplayEnabled);
  const ttsRequestedTurns = organicSuccessfulTurns.filter((turn) =>
    turn.ttsRequested);
  const ttsGenerationSuccesses = ttsRequestedTurns.filter((turn) =>
    turn.ttsGenerationOutcome === "success");
  const ttsGenerationFailures = ttsRequestedTurns.filter((turn) =>
    turn.ttsGenerationOutcome === "request_failed");
  const ttsPlaybackStartedTurns = ttsRequestedTurns.filter((turn) =>
    turn.ttsPlaybackStartedAt !== null ||
    // Legacy reports can predate the explicit start timestamp but still carry
    // an unambiguous started/completed outcome.
    turn.ttsPlaybackOutcome === "started" ||
    turn.ttsPlaybackOutcome === "completed");
  const ttsPlaybackCompletedTurns = ttsRequestedTurns.filter((turn) =>
    turn.ttsPlaybackOutcome === "completed");
  const ttsPlaybackInterruptedTurns = ttsRequestedTurns.filter((turn) =>
    turn.ttsPlaybackOutcome === "interrupted");
  const ttsPlaybackBlockedTurns = ttsRequestedTurns.filter((turn) =>
    turn.ttsPlaybackOutcome === "blocked");
  const ttsPlaybackFailures = ttsRequestedTurns.filter((turn) =>
    turn.ttsPlaybackOutcome === "failed");
  const ttsPlaybackFromCacheCount = ttsRequestedTurns.filter((turn) =>
    turn.ttsPlaybackFromCache === true).length;
  const ttsNegativeFeedbackCount = turns.filter((turn) =>
    turn.ttsFeedback === "negative").length;
  const ttsNegativeFeedbackWithCompletedPlaybackCount = turns.filter((turn) =>
    turn.ttsFeedback === "negative" && turn.ttsPlaybackOutcome === "completed").length;
  const manualTtsRequests = ttsRequestedTurns.filter((turn) =>
    turn.ttsRequestReason === "manual_play");
  const organicTtsDegradations = organicDiagnosticEvents.filter((event) =>
    event.category === "TTS" && event.eventKind === "degradation");
  const qaTerminalFailures = qaTurns.filter((turn) => turn.status === "failed");
  const qaDegradations = qaEvents.filter((event) =>
    event.eventKind === "degradation");
  const qaFailures = qaEvents.filter((event) => event.eventKind === "failure");
  const qaResult = qaTurns.length === 0
    ? "not_run" as const
    : qaTerminalFailures.length > 0
      ? "passed_with_expected_terminal_failures" as const
      : "passed" as const;
  const keyFindings = [
    ...(organicTurns.length > 0 && organicSuccessfulTurns.length === organicTurns.length
      ? ["all_organic_turns_successful"] : []),
    ...(realtimeStabilityFailure ? ["realtime_unstable"] : []),
    ...(realtimeSuccessfulTurns.filter((turn) =>
      turn.realtimeConnectionReused && turn.warmStart).length >= 3 &&
      !realtimeStabilityFailure &&
      realtimeAttemptSuccessRate === 1 ? ["realtime_warm_path_healthy"] : []),
    ...(activeRecordingStartStuck ? ["recording_start_stuck"] : []),
    ...(recordingStartTimeouts.length > 0 ? ["microphone_start_timeout"] : []),
    ...(recordingStartFailures.length > 0 ? ["pre_turn_failure"] : []),
    ...(organicFallbackTurns.length > 0 &&
      organicFallbackSuccesses.length === organicFallbackTurns.length
      ? ["fallback_healthy"] : []),
    ...(userPerceived.median !== null && userPerceived.median > 10_000
      ? ["performance_slow"] : []),
    ...(organicTurns.some((turn) => turn.audioQualityMetrics.source === "unavailable")
      ? ["audio_quality_metrics_unavailable"] : []),
    ...(reviewedOrganicQualityTurns.length === 0 && organicTurns.length > 0
      ? ["learning_ground_truth_missing"] : []),
    ...(summaryGeneratedTurns.length > 0 ? ["summary_available"] : []),
    ...(ttsGenerationFailures.length > 0 ? ["tts_unavailable"] : []),
    ...(ttsPlaybackBlockedTurns.length > 0 ? ["tts_playback_blocked"] : []),
    ...(benchmarkComparisons.some((comparison) =>
      comparison.benchmarkParityVersion === speechBenchmarkSummary.benchmarkParityVersion) &&
      speechBenchmarkSummary.reviewedSamplesCurrentParity < 5
      ? ["speech_benchmark_insufficient_evidence"] : []),
    ...(benchmarkComparisons.some((comparison) =>
      comparison.benchmarkParityVersion === speechBenchmarkSummary.benchmarkParityVersion &&
      comparison.benchmarkStatus === "pending")
      ? ["speech_benchmark_collecting"] : []),
    ...(benchmarkComparisons.some((comparison) =>
      comparison.benchmarkParityVersion === speechBenchmarkSummary.benchmarkParityVersion &&
      comparison.benchmarkStatus === "completed" && comparison.groundTruthStatus === "unreviewed")
      ? ["speech_benchmark_ready_for_review"] : []),
  ];

  return {
    reportVersion: REPORT_VERSION,
    reportRevision: REPORT_REVISION,
    stabilityObservabilityVersion: PERFORMANCE_OPTIMIZATION_VERSION,
    performanceOptimizationVersion: PERFORMANCE_OPTIMIZATION_VERSION,
    translationStreamingEnabled: false,
    ttsStreamingEnabled: true,
    earlyTtsEnabled: false,
    preOpenAiOptimizationEnabled: true,
    translationPreOpenAiOptimized: true,
    ttsPreOpenAiOptimized: true,
    appVersion: buildMetadata.appVersion,
    buildVersion: buildMetadata.buildVersion,
    gitCommitSha: buildMetadata.gitCommitSha,
    environment: buildMetadata.environment,
    deploymentId: buildMetadata.deploymentId,
    vercelEnvironment: buildMetadata.vercelEnvironment,
    frontendRuntimeEnvironment: buildMetadata.frontendRuntimeEnvironment,
    frontendOriginKind: buildMetadata.frontendOriginKind,
    backendEnvironmentLabel: buildMetadata.backendEnvironmentLabel,
    diagnosticsSharingEnabled: settings.diagnosticsSharingEnabled,
    qualityContentSharingEnabled: settings.qualityContentSharingEnabled,
    speechSampleSharingEnabled: settings.speechSampleSharingEnabled,
    installationId: input.installationId ?? null,
    sessionId: input.sessionId ?? null,
    reportId:
      input.reportId ??
      globalThis.crypto?.randomUUID?.() ??
      `report-${Date.now()}`,
    startedAt: input.startedAt,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    userAgent: input.userAgent,
    platform: input.platform,
    translatorMode:
      turnModes.size > 1
        ? "mixed"
        : (turnModes.values().next().value ?? input.currentMode),
    translationModel: CLASSIC_TRANSLATION_MODEL,
    ttsModel: CLASSIC_TTS_MODEL,
    ttsSpeed: input.ttsSpeed,
    totalTurns: turns.length,
    recordingStartAttempts: recordingStartAttempts.length,
    recordingStartSuccesses: recordingStartAttempts.filter((attempt) =>
      attempt.outcome === "recording_started").length,
    recordingStartTimeouts: recordingStartTimeouts.length,
    recordingStartFailures: recordingStartFailures.length,
    preTurnIncidentCount,
    activeRecordingStartAttempt,
    recordingStartOutcomeCounts,
    successfulTurns: successful.length,
    failedTurns: failedTurns.length,
    failureCount: failedTurns.length,
    sessionTurnSuccessRate,
    organicTotalTurns: organicTurns.length,
    organicSuccessfulTurns: organicSuccessfulTurns.length,
    organicFailedTurns: organicFailedTurns.length,
    organicProductTurnSuccessRate: productTurnSuccessRate,
    organicRealtimeEligibleTurns: realtimeEligibleTurns.length,
    organicRealtimeAttemptedTurns: realtimeAttemptedTurns.length,
    organicRealtimeSuccessfulTurns: realtimeSuccessfulTurns.length,
    organicRealtimeAttemptSuccessRate: realtimeAttemptSuccessRate,
    organicFallbackTurns: organicFallbackTurns.length,
    organicFallbackSuccessRate: rate(
      organicFallbackSuccesses.length,
      organicFallbackTurns.length,
    ),
    diagnosticEventCount: diagnosticEvents.length + recordingStartTimelineItems.length,
    organicRuntimeFailureCount: organicDiagnosticEvents.filter((event) =>
      event.eventKind === "failure").length,
    qaSimulationEventCount: diagnosticEvents.filter((event) =>
      event.eventOrigin === "qa_simulation").length,
    degradationCount: diagnosticEvents.filter((event) =>
      event.eventKind === "degradation").length,
    expectedFallbackCount: diagnosticEvents.filter((event) =>
      event.eventKind === "expected_fallback").length,
    organicRuntimeDegradationCount: organicDiagnosticEvents.filter((event) =>
      event.eventKind === "degradation").length,
    qaSimulationFailureCount: diagnosticEvents.filter((event) =>
      event.eventOrigin === "qa_simulation" && event.eventKind === "failure").length,
    qaSimulationDegradationCount: diagnosticEvents.filter((event) =>
      event.eventOrigin === "qa_simulation" && event.eventKind === "degradation").length,
    eventsByOrigin: countEventsBy(diagnosticEvents, (event) => event.eventOrigin),
    eventsByKind: countEventsBy(diagnosticEvents, (event) => event.eventKind),
    eventsByCategory: countEventsBy(diagnosticEvents, (event) => event.category),
    eventsByStage: countEventsBy(diagnosticEvents, (event) => event.stage),
    eventsByHttpStatus: countEventsBy(diagnosticEvents, (event) =>
      event.httpStatus === null ? null : String(event.httpStatus)),
    eventsByApiCode: countEventsBy(diagnosticEvents, (event) => event.apiCode),
    failuresByCategory: countEventsBy(failureEvents, (event) => event.category),
    failuresByStage: countEventsBy(failureEvents, (event) => event.stage),
    failuresByHttpStatus: countEventsBy(failureEvents, (event) =>
      event.httpStatus === null ? null : String(event.httpStatus)),
    failuresByApiCode: countEventsBy(failureEvents, (event) => event.apiCode),
    recoveryAttempts,
    successfulRecoveries: diagnosticEvents.filter(
      (event) => event.recoverySucceeded === true,
    ).length,
    recoveredTranslationSttTurns: recoveredDegradationTurns.length,
    qaScenariosTriggered,
    qaScenariosRecovered,
    qaSummary: {
      qaTurns: qaTurns.length,
      qaScenariosTriggered,
      qaScenariosRecovered,
      qaTerminalFailures: qaTerminalFailures.length,
      qaFailures: qaFailures.length,
      qaDegradations: qaDegradations.length,
      qaReviewCandidates: qaTurns.filter((turn) =>
        turn.recognitionReviewStatus !== null).length,
      qaResult,
    },
    sttAcceptedCount: turns.filter((turn) =>
      turn.recognitionReviewStatus === "accepted").length,
    sttCorrectionCount: turns.filter((turn) =>
      turn.recognitionReviewStatus === "corrected").length,
    sttUnreviewedCount: turns.filter((turn) =>
      turn.recognitionReviewStatus === "unreviewed").length,
    speechQualitySampleCount: turns.filter((turn) =>
      turn.speechQualitySampleId !== null).length,
    speechFeedbackCount: Array.from(input.feedbackByTurn?.values() ?? []).filter((feedback) =>
      feedback.speechFeedbackStatus !== null && feedback.speechFeedbackStatus !== undefined).length,
    speechAcceptedCount: turns.filter((turn) => turn.recognitionReviewStatus === "accepted").length,
    speechCorrectedCount: turns.filter((turn) => turn.recognitionReviewStatus === "corrected").length,
    translationPositiveFeedbackCount: Array.from(input.feedbackByTurn?.values() ?? []).filter((feedback) =>
      feedback.translationFeedback === "positive").length,
    translationNegativeFeedbackCount: Array.from(input.feedbackByTurn?.values() ?? []).filter((feedback) =>
      feedback.translationFeedback === "negative").length,
    ttsFeedbackCount: Array.from(input.feedbackByTurn?.values() ?? []).filter((feedback) =>
      feedback.ttsFeedback !== null && feedback.ttsFeedback !== undefined).length,
    benchmarkGroundTruthCount: speechBenchmarkSummary.sameAudioGroundTruthReviewed,
    speechReviewCandidateCount: turns.filter((turn) =>
      turn.recognitionReviewStatus !== null).length,
    organicSpeechReviewCandidateCount: organicTurns.filter((turn) =>
      turn.recognitionReviewStatus !== null).length,
    correctionRate: rate(
      turns.filter((turn) => turn.recognitionReviewStatus === "corrected").length,
      reviewedQualityTurns.length,
    ),
    audioEligibleTurnCount: turns.filter((turn) =>
      turn.speechAudioEligibleForTurn).length,
    audioIncludedTurnCount: turns.filter((turn) =>
      turn.audioIncludedInDiagnosticBundle).length,
    organicFailureRate: rate(organicFailedTurns.length, organicTurns.length),
    productTurnSuccessRate,
    primaryPathSuccessRate,
    fallbackRecoveryRate,
    keyFindings,
    executiveSummary: {
      overallHealth: organicFailedTurns.length > 0
        ? "problematic" as const
        : preTurnIncidentCount > 0 ||
            realtimeStabilityFailure ||
            organicDiagnosticEvents.some((event) =>
              event.eventKind === "degradation") ||
            safePathTurns.length > 0
          ? "degraded" as const
          : "healthy" as const,
      turns: turns.length,
      successful: successful.length,
      terminalFailures: failedTurns.length,
      organicTurns: organicTurns.length,
      organicSuccessful: organicSuccessfulTurns.length,
      organicTerminalFailures: organicFailedTurns.length,
      organicFailures: organicFailedTurns.length,
      primaryFinding: realtimeAttemptedTurns.length > 0 &&
        realtimeSuccessfulTurns.length === 0 && organicFallbackSuccesses.length > 0
        ? "realtime_unstable_fallback_healthy" as const
        : null,
      keyFindings,
      productTurnSuccessRate,
      organicProductTurnSuccessRate: productTurnSuccessRate,
      sessionTurnSuccessRate,
      primaryPathSuccessRate,
      fallbackRecoveryRate,
      recoveredTurns: recoveredDegradationTurns.length,
      recoveredDegradationTurns: recoveredDegradationTurns.length,
      realtimeEligibleTurns: realtimeEligibleTurns.length,
      realtimeAttemptedTurns: realtimeAttemptedTurns.length,
      realtimeSuccessfulTurns: realtimeSuccessfulTurns.length,
      realtimeAttemptSuccessRate,
      realtimeSuccessRate: realtimeAttemptSuccessRate,
      coldFallbackTurns: coldFallbackTurns.length,
      connectionLossFallbackTurns: connectionLossFallbackTurns.length,
      audioFallbackTurns: organicFallbackTurns.length,
      audioFallbackSuccessRate: rate(
        organicFallbackSuccesses.length,
        organicFallbackTurns.length,
      ),
      webKitSafeModeTurns: webKitSafeModeTurns.length,
      sttRescueAttempts: semanticRescueTurns.length,
      sttRescueSuccessRate: rate(semanticRescueSuccesses, semanticRescueTurns.length),
      micTimeouts: turns.filter((turn) =>
        turn.microphoneAcquisitionOutcome === "timeout").length,
      invalidAudioCaptures: turns.filter((turn) =>
        turn.capturePathOutcome === "invalid_audio_capture").length,
      summaryEligibleTurns: summaryEligibleTurns.length,
      summaryGeneratedTurns: summaryGeneratedTurns.length,
      reviewedLearningSamples: reviewedOrganicQualityTurns.length,
      ttsRequestSuccessRate: rate(
        ttsGenerationSuccesses.length,
        ttsRequestedTurns.length,
      ),
      ttsPlaybackSuccessRate: rate(
        ttsPlaybackCompletedTurns.length,
        ttsPlaybackCompletedTurns.length +
          ttsPlaybackInterruptedTurns.length +
          ttsPlaybackBlockedTurns.length +
          ttsPlaybackFailures.length,
      ),
      qa: {
        qaTurns: qaTurns.length,
        qaTerminalFailures: qaTerminalFailures.length,
        qaResult,
      },
      recordingStartAttempts: recordingStartAttempts.length,
      recordingStartSuccesses: recordingStartAttempts.filter((attempt) =>
        attempt.outcome === "recording_started").length,
      recordingStartTimeouts: recordingStartTimeouts.length,
      recordingStartFailures: recordingStartFailures.length,
      preTurnIncidentCount,
      activeRecordingStartAttempt,
      recordingStartOutcomeCounts,
      topOrganicFailureCode,
      recommendedQaFocus,
    },
    learningSummary: {
      reviewedSpeechSamples: reviewedOrganicQualityTurns.length,
      acceptedSpeechSamples: organicTurns.filter((turn) =>
        turn.recognitionReviewStatus === "accepted").length,
      correctedSpeechSamples: organicTurns.filter((turn) =>
        turn.recognitionReviewStatus === "corrected").length,
      sameAudioComparisonCount: organicTurns.filter((turn) =>
        Boolean(turn.sttCandidateComparison?.rescue)).length,
      realtimeToRescueTranscriptDisagreementCount: organicTurns.filter((turn) =>
        turn.sttCandidateComparison?.didTranscriptChange === true).length,
      sessionSameAudioComparisonCount: comparisons.filter((comparison) =>
        comparison.rescue !== null).length,
      semanticRescueAttempts: semanticRescueTurns.length,
      semanticRescueSuccesses,
      semanticRescueFailures: semanticRescueTurns.length - semanticRescueSuccesses,
      semanticCircuitBreakerTrips: input.realtimeSemanticCircuitBreakerTrips ?? 0,
      organicUnsupportedLanguageCount: organicUnsupportedLanguageEvents.length,
      fallbackPreferredDueToCircuitBreakerCount: safePathTurns.length,
      benchmarkReadySameAudioSampleCount: organicTurns.filter((turn) =>
        turn.learningSignal?.benchmarkReadySameAudioSample).length,
    },
    speechBenchmarkSummary,
    sttRoutingSummary: {
      realtimePrimaryTurns: organicTurns.filter((turn) =>
        turn.sttRoutingDecision === "realtime_primary").length,
      realtimePrimarySuccesses: organicSuccessfulTurns.filter((turn) =>
        turn.sttRoutingDecision === "realtime_primary").length,
      coldFallbackTurns: coldFallbackTurns.length,
      coldFallbackSuccesses: coldFallbackTurns.filter((turn) =>
        turn.status === "success").length,
      connectionLossFallbackTurns: connectionLossFallbackTurns.length,
      connectionLossFallbackSuccesses: connectionLossFallbackTurns.filter((turn) =>
        turn.status === "success").length,
      semanticRescueAttempts: semanticRescueTurns.length,
      semanticRescueSuccesses,
      semanticRescueTurns: semanticRescueTurns.length,
      semanticSafeModeTurns: safePathTurns.length,
      featureFlagSafeModeTurns: featureFlagSafePathTurns.length,
      circuitBreakerSafePathTurns: safePathTurns.length,
      circuitBreakerSafePathSuccesses: safePathTurns.filter((turn) =>
        turn.status === "success").length,
      qaForcedFallbackTurns: turns.filter((turn) =>
        turn.diagnosticEvents.some((event) =>
          event.eventOrigin === "qa_simulation") &&
        turn.sttRoutingDecision !== "realtime_primary").length,
      terminalSttFailures: organicTurns.filter((turn) =>
        turn.status === "failed" &&
        (turn.failureCategory === "TRANSCRIPTION" || turn.failureCategory === "REALTIME" ||
          turn.apiErrorCode === "unsupported_language")).length,
    },
    incidentTimeline,
    reportIntegrity: {
      schemaVersion: "translator-report-v5.2.7",
      reportRevision: REPORT_REVISION,
      sessionComplete: false,
      persistedSnapshotUsed: input.persistedSnapshotUsed === true,
      droppedTelemetryEvents: input.droppedTelemetryEvents ?? 0,
      audioManifestConsistent: input.audioManifestConsistent ?? null,
      consentSnapshotComplete: turns.every((turn) =>
        turn.consentAtRecordingStart !== null &&
        turn.consentAtTurnFinalization !== null),
      buildMetadataComplete:
        buildMetadata.appVersion !== "unknown" &&
        buildMetadata.buildVersion !== "unknown" &&
        buildMetadata.frontendRuntimeEnvironment !== "unknown" &&
        buildMetadata.backendEnvironmentLabel !== "unknown",
    },
    consentEvents: input.consentEvents ?? [],
    realtimeTurns: realtimeAll.length,
    fallbackTurns: fallbackAll.length,
    realtimeRate: rate(realtimeAll.length, pathDecidedTurns),
    fallbackRate: rate(fallbackAll.length, pathDecidedTurns),
    warmRealtimeTurns: warmRealtimeAll.length,
    coldRealtimeTurns: realtimeAll.length - warmRealtimeAll.length,
    warmReuseRate: rate(warmRealtimeAll.length, realtimeAll.length),
    initialRealtimeSetupMs,
    connectionAttemptsTotal:
      input.connectionAttemptsTotal ?? sourceConnectionAttempts.length,
    connectionSuccesses:
      input.connectionSuccesses ??
      sourceConnectionAttempts.filter((attempt) => attempt.status === "success").length,
    connectionFailures:
      input.connectionFailures ??
      sourceConnectionAttempts.filter((attempt) => attempt.status === "failed").length,
    reconnectCount: input.reconnectCount ??
      sourceConnectionAttempts.filter((attempt) => attempt.reason === "reconnect").length,
    realtimeConnectionStateTimeline:
      input.realtimeConnectionStateTimeline ?? [],
    microphoneAcquisitionAttempts: turns.filter((turn) =>
      turn.microphoneAcquisitionAttemptId !== null).length,
    microphoneAcquisitionTimeouts: turns.filter((turn) =>
      turn.microphoneAcquisitionOutcome === "timeout").length,
    freshStreamCount: turns.filter((turn) => turn.freshStreamRequested).length,
    reusedStreamCount: turns.filter((turn) => turn.streamReused).length,
    invalidAudioCaptureCount: turns.filter((turn) =>
      turn.capturePathOutcome === "invalid_audio_capture").length,
    poisonedStreamCount: turns.filter((turn) =>
      turn.capturePathOutcome === "invalid_audio_capture").length,
    realtimeFinalizationFailureCount:
      input.realtimeFinalizationFailureCount ?? turns.filter((turn) =>
        ["empty_transcript", "transcript_timeout", "transcript_not_finalized"]
          .includes(turn.fallbackReason ?? "")).length,
    realtimeCircuitBreakerTrips: input.realtimeCircuitBreakerTrips ?? 0,
    audioFallbackSuccessCount: audioFallbackSuccesses,
    fallbackReasons,
    organicFallbackReasons,
    translationStreamingTurns: successful.filter(
      (turn) => turn.translationStreamingUsed,
    ).length,
    ttsStreamingTurns: ttsStreamingTurns.length,
    streamingFallbackTurns: streamingFallbackTurns.length,
    streamingFallbackReasons,
    medianUserPerceivedPostStopLatencyMs: userPerceived.median,
    p90UserPerceivedPostStopLatencyMs:
      "p90" in userPerceived ? userPerceived.p90 : null,
    medianTranslationServerPreOpenAiMs: translationPreOpenAi.median,
    p90TranslationServerPreOpenAiMs:
      "p90" in translationPreOpenAi ? translationPreOpenAi.p90 : null,
    medianTtsServerPreOpenAiMs: ttsPreOpenAi.median,
    p90TtsServerPreOpenAiMs:
      "p90" in ttsPreOpenAi ? ttsPreOpenAi.p90 : null,
    medianCombinedPreOpenAiMs: combinedPreOpenAi.median,
    p90CombinedPreOpenAiMs:
      "p90" in combinedPreOpenAi ? combinedPreOpenAi.p90 : null,
    performanceBudgets: {
      warmRecordClickToRecordingStartedMs: 100,
      stopToTranscriptFinalMs: 1_200,
      transcriptFinalToTranslationVisibleMs: 3_000,
      translationVisibleToFirstPlayableAudioMs: 1_500,
      stopToPlaybackStartedMs: 5_000,
      translationAuthMs: 150,
      translationValidationMs: 50,
      translationPromptPreparationMs: 20,
      translationOpenAiClientPreparationMs: 20,
      translationServerPreOpenAiMs: 300,
      ttsAuthMs: 150,
      ttsValidationMs: 50,
      ttsInstructionPreparationMs: 20,
      ttsOpenAiClientPreparationMs: 20,
      ttsServerPreOpenAiMs: 300,
      combinedPreOpenAiMs: 600,
    },
    transcriptionModels,
    connectionAttempts,
    performanceSummary: {
      allSuccessfulTurns: performanceGroup(successful),
      organicSuccessfulTurns: performanceGroup(organicSuccessfulTurns),
      realtimeTurns: performanceGroup(realtime),
      audioUploadFallbackTurns: performanceGroup(fallback),
      warmReusedRealtimeTurns: performanceGroup(warmRealtime),
      ttsStreamingTurns: performanceGroup(ttsStreamingTurns),
      nonStreamingTtsTurns: performanceGroup(nonStreamingTtsTurns),
    },
    bottleneckSummary: bottleneckSummary(organicSuccessfulTurns),
    preOpenAiBottleneckSummary: preOpenAiBottleneckSummary(organicSuccessfulTurns),
    preOpenAiBottleneckSummaryByGroup: {
      allSuccessfulTurns: preOpenAiBottleneckSummary(successful),
      warmReusedRealtimeTurns: preOpenAiBottleneckSummary(warmRealtime),
      audioUploadFallbackTurns: preOpenAiBottleneckSummary(fallback),
    },
    sections: {
      reliability: {
        productTurnSuccessRate,
        organicTotalTurns: organicTurns.length,
        organicSuccessfulTurns: organicSuccessfulTurns.length,
        organicFailedTurns: organicFailedTurns.length,
        sessionTotalTurns: turns.length,
        sessionSuccessfulTurns: successful.length,
        sessionTerminalFailures: failedTurns.length,
        realtimeAttemptedTurns: realtimeAttemptedTurns.length,
        realtimeSuccessfulTurns: realtimeSuccessfulTurns.length,
        audioFallbackTurns: organicFallbackTurns.length,
        audioFallbackSuccesses: organicFallbackSuccesses.length,
        recoveredDegradationTurns: recoveredDegradationTurns.length,
        recordingStartAttempts: recordingStartAttempts.length,
        recordingStartSuccesses: recordingStartAttempts.filter((attempt) =>
          attempt.outcome === "recording_started").length,
        recordingStartTimeouts: recordingStartTimeouts.length,
        recordingStartFailures: recordingStartFailures.length,
        preTurnIncidentCount,
      },
      quality: {
        reviewedTurns: reviewedOrganicQualityTurns.length,
        summaryEligibleTurns: summaryEligibleTurns.length,
        summaryGeneratedTurns: summaryGeneratedTurns.length,
        audioQualityMeasuredTurns: organicTurns.filter((turn) =>
          turn.audioQualityMetrics.evidence === "measured").length,
      },
      performance: {
        medianStopToPlaybackStartedMs: userPerceived.median,
        p90StopToPlaybackStartedMs:
          "p90" in userPerceived ? userPerceived.p90 : null,
      },
      learning: {
        speechReviewCandidates: organicTurns.filter((turn) =>
          turn.recognitionReviewStatus !== null).length,
        reviewedLearningSamples: reviewedOrganicQualityTurns.length,
        benchmarkReadySameAudioSampleCount: organicTurns.filter((turn) =>
          turn.learningSignal?.benchmarkReadySameAudioSample).length,
      },
      tts: {
        autoplayEnabledTurns: autoplayEnabledTurns.length,
        ttsRequestedTurns: ttsRequestedTurns.length,
        ttsGenerationSuccesses: ttsGenerationSuccesses.length,
        ttsGenerationFailures: ttsGenerationFailures.length,
        ttsRequestSuccessRate: rate(
          ttsGenerationSuccesses.length,
          ttsRequestedTurns.length,
        ),
        ttsPlaybackStartedTurns: ttsPlaybackStartedTurns.length,
        ttsPlaybackCompletedTurns: ttsPlaybackCompletedTurns.length,
        ttsPlaybackInterruptedTurns: ttsPlaybackInterruptedTurns.length,
        ttsPlaybackBlockedTurns: ttsPlaybackBlockedTurns.length,
        ttsPlaybackFailures: ttsPlaybackFailures.length,
        ttsPlaybackFailedTurns: ttsPlaybackFailures.length,
        ttsPlaybackFromCacheCount,
        ttsNegativeFeedbackCount,
        ttsNegativeFeedbackWithCompletedPlaybackCount,
        ttsPlaybackSuccessRate: rate(
          ttsPlaybackCompletedTurns.length,
          ttsPlaybackCompletedTurns.length +
            ttsPlaybackInterruptedTurns.length +
            ttsPlaybackBlockedTurns.length +
            ttsPlaybackFailures.length,
        ),
        manualTtsRequests: manualTtsRequests.length,
        organicTtsDegradations: organicTtsDegradations.length,
      },
      qa: {
        qaTurns: qaTurns.length,
        qaScenariosTriggered,
        qaScenariosRecovered,
        qaTerminalFailures: qaTerminalFailures.length,
        qaFailures: qaFailures.length,
        qaDegradations: qaDegradations.length,
        qaReviewCandidates: qaTurns.filter((turn) =>
          turn.recognitionReviewStatus !== null).length,
        qaResult,
      },
      environment: {
        appVersion: buildMetadata.appVersion,
        frontendRuntimeEnvironment: buildMetadata.frontendRuntimeEnvironment,
        frontendOriginKind: buildMetadata.frontendOriginKind,
        backendEnvironmentLabel: buildMetadata.backendEnvironmentLabel,
      },
    },
    turns,
  };
}

export function classicTranslatorReportFilename(now = new Date()) {
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `translator-report-${stamp}.json`;
}

export function downloadClassicTranslatorReport(
  report: ReturnType<typeof buildClassicTranslatorReport>,
) {
  if (typeof document === "undefined") return false;
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = classicTranslatorReportFilename();
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
