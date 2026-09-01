import type { ClassicRealtimeConnectionAttempt } from "@/lib/translator/classicRealtimeSessionManager";
import type { TranslatorFeedbackCategory, TranslatorFeedbackRating } from "@/lib/translator/feedback";
import type {
  TranslationDiagnostics,
  TranslationEntry,
  TranslationLanguage,
  TranslationMode,
  TranscriptionPath,
} from "@/lib/translator/types";

const REPORT_VERSION = 3;
const PERFORMANCE_OPTIMIZATION_VERSION = "classic-post-stop-v3";
const CLASSIC_TTS_MODEL = "gpt-4o-mini-tts";
const CLASSIC_TRANSLATION_MODEL = "gpt-5.6-terra";

export type ClassicTranslatorAudioMetadata = {
  audioMimeType: string | null;
  audioSize: number | null;
};

export type ClassicTranslatorLocalFeedback = {
  feedbackRating: TranslatorFeedbackRating;
  feedbackCategories: TranslatorFeedbackCategory[];
  feedbackComment: string | null;
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
};

const PERFORMANCE_METRICS = [
  "recordClickToMicReadyMs",
  "recordClickToRecordingStartedMs",
  "realtimeSetupMs",
  "recordingDurationMs",
  "stopToTranscriptFinalMs",
  "transcriptFinalToTranslationRequestStartMs",
  "translationClientToServerMs",
  "translationServerPreOpenAiMs",
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
  ttsStartedAt: string | null;
  ttsReadyAt: string | null;
  ttsClientRequestStartedAt: string | null;
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
  firstPlayableAudioAt: string | null;
  playRequestedAt: string | null;
  ttsRequestCorrelationId: string | null;
  playbackStartedAt: string | null;
  playbackCompletedAt: string | null;
  recordClickToGetUserMediaReadyMs: number | null;
  recordClickToMicReadyMs: number | null;
  recordClickToRecordingStartedMs: number | null;
  getUserMediaToRecordingStartedMs: number | null;
  realtimeSetupMs: number | null;
  recordingDurationMs: number | null;
  stopToTranscriptFinalMs: number | null;
  transcriptFinalToTranslationReadyMs: number | null;
  clientToTranslationServerMs: number | null;
  translationClientToServerMs: number | null;
  translationServerPreOpenAiMs: number | null;
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
  errorStage: string | null;
  errorType: string | null;
  errorCode: string | null;
  sanitizedErrorMessage: string | null;
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
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
    criticalPathStage("translation_openai", d.translationOpenAiRequestStartedAt, d.translationOpenAiCompletedAt, d.translationOpenAiTotalMs),
    criticalPathStage("translation_server_post_openai", d.translationOpenAiCompletedAt, d.translationServerSerializationDoneAt, d.translationServerPostOpenAiMs),
    criticalPathStage("translation_server_to_client", d.translationServerResponseStartedAt, d.translationClientResponseFirstByteAt, d.translationServerToClientMs),
    criticalPathStage("translation_client_render", d.translationClientResponseCompletedAt, d.translationVisibleAt, d.translationClientPostResponseMs),
    criticalPathStage("tts_client_to_server", d.ttsClientRequestStartedAt, d.ttsServerRequestReceivedAt, d.ttsClientToServerMs),
    criticalPathStage("tts_server_pre_openai", d.ttsServerRequestReceivedAt, d.ttsOpenAiRequestStartedAt, d.ttsServerPreOpenAiMs),
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
  ] as const;
  return budgets.flatMap(([metric, value, budgetMs]) => {
    const actualMs = finite(value);
    return actualMs !== null && actualMs >= budgetMs
      ? [{ metric, budgetMs, actualMs }]
      : [];
  });
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
}): ClassicTranslatorReportTurn {
  const d = input.diagnostics;
  const path = d.transcriptionPath ?? null;
  const text = input.originalText;
  const translated = input.translatedText;
  return {
    turnId: input.turnId,
    createdAt: input.createdAt,
    status: input.status,
    translatorMode: input.mode,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    originalText: text,
    translatedText: translated,
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
    ttsStartedAt: d.ttsStartedAt ?? null,
    ttsReadyAt: d.ttsReadyAt ?? null,
    ttsClientRequestStartedAt: d.ttsClientRequestStartedAt ?? null,
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
    firstPlayableAudioAt: d.firstPlayableAudioAt ?? null,
    playRequestedAt: d.playRequestedAt ?? null,
    ttsRequestCorrelationId: d.ttsRequestCorrelationId ?? null,
    playbackStartedAt: d.playbackStartedAt ?? null,
    playbackCompletedAt: d.playbackCompletedAt ?? null,
    recordClickToGetUserMediaReadyMs: finite(d.recordClickToGetUserMediaReadyMs),
    recordClickToMicReadyMs: finite(d.recordClickToMicReadyMs),
    recordClickToRecordingStartedMs: finite(d.recordClickToRecordingStartedMs),
    getUserMediaToRecordingStartedMs: finite(d.getUserMediaToRecordingStartedMs),
    realtimeSetupMs: finite(d.realtimeSetupMs),
    recordingDurationMs: finite(d.recordingDurationMs),
    stopToTranscriptFinalMs: finite(d.stopToTranscriptFinalMs),
    transcriptFinalToTranslationReadyMs: finite(
      d.transcriptFinalToTranslationReadyMs,
    ),
    clientToTranslationServerMs: finite(d.clientToTranslationServerMs),
    translationClientToServerMs: finite(
      d.translationClientToServerMs ?? d.clientToTranslationServerMs,
    ),
    translationServerPreOpenAiMs: finite(d.translationServerPreOpenAiMs),
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
    errorStage: input.errorStage,
    errorType: input.errorType,
    errorCode: input.errorCode,
    sanitizedErrorMessage: input.sanitizedErrorMessage
      ? sanitizeClassicReportError(input.sanitizedErrorMessage)
      : null,
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
}) {
  const sourceConnectionAttempts = input.connectionAttempts ?? [];
  const successfulTurns = input.entries.map((entry) => {
    const diagnostics: Partial<TranslationDiagnostics> = entry.diagnostics ?? {};
    return turnFromValues({
      turnId: entry.id,
      createdAt: new Date(entry.timestamp).toISOString(),
      status: "success",
      mode: modeForEntry(entry),
      sourceLanguage: entry.sourceLanguage,
      targetLanguage: entry.targetLanguage,
      originalText: entry.originalText,
      translatedText: entry.translatedText,
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
    });
  });
  const failedTurns = input.failedTurns.map((turn) => {
    return turnFromValues({
      turnId: turn.turnId,
      createdAt: turn.createdAt,
      status: "failed",
      mode: turn.mode,
      sourceLanguage: turn.sourceLanguage ?? null,
      targetLanguage: turn.targetLanguage ?? null,
      originalText: turn.originalText ?? null,
      translatedText: turn.translatedText ?? null,
      diagnostics: turn.diagnostics,
      audio: {
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
  const userPerceived = metricSummary(
    successful
      .filter((turn) => turn.autoplayEnabled)
      .map((turn) => turn.stopToPlaybackStartedMs),
  );
  const initialRealtimeSetupMs = finite(
    sourceConnectionAttempts.find((attempt) => attempt.status === "success")
      ?.totalSetupMs,
  );

  return {
    reportVersion: REPORT_VERSION,
    performanceOptimizationVersion: PERFORMANCE_OPTIMIZATION_VERSION,
    translationStreamingEnabled: false,
    ttsStreamingEnabled: true,
    earlyTtsEnabled: false,
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
    successfulTurns: successful.length,
    failedTurns: failedTurns.length,
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
    fallbackReasons,
    translationStreamingTurns: successful.filter(
      (turn) => turn.translationStreamingUsed,
    ).length,
    ttsStreamingTurns: ttsStreamingTurns.length,
    streamingFallbackTurns: streamingFallbackTurns.length,
    streamingFallbackReasons,
    medianUserPerceivedPostStopLatencyMs: userPerceived.median,
    p90UserPerceivedPostStopLatencyMs:
      "p90" in userPerceived ? userPerceived.p90 : null,
    performanceBudgets: {
      warmRecordClickToRecordingStartedMs: 100,
      stopToTranscriptFinalMs: 1_200,
      transcriptFinalToTranslationVisibleMs: 3_000,
      translationVisibleToFirstPlayableAudioMs: 1_500,
      stopToPlaybackStartedMs: 5_000,
    },
    transcriptionModels,
    connectionAttempts,
    performanceSummary: {
      allSuccessfulTurns: performanceGroup(successful),
      realtimeTurns: performanceGroup(realtime),
      audioUploadFallbackTurns: performanceGroup(fallback),
      warmReusedRealtimeTurns: performanceGroup(warmRealtime),
      ttsStreamingTurns: performanceGroup(ttsStreamingTurns),
      nonStreamingTtsTurns: performanceGroup(nonStreamingTtsTurns),
    },
    bottleneckSummary: bottleneckSummary(successful),
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
