import type { ClassicRealtimeConnectionAttempt } from "@/lib/translator/classicRealtimeSessionManager";
import type { TranslatorFeedbackCategory, TranslatorFeedbackRating } from "@/lib/translator/feedback";
import type {
  TranslationDiagnostics,
  TranslationEntry,
  TranslationLanguage,
  TranslationMode,
  TranscriptionPath,
} from "@/lib/translator/types";

const REPORT_VERSION = 2;
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
  "transcriptFinalToTranslationReadyMs",
  "stopToTranslationVisibleMs",
  "translationReadyToTtsReadyMs",
  "ttsRequestToReadyMs",
  "stopToTtsReadyMs",
  "ttsReadyToPlaybackStartedMs",
  "stopToPlaybackStartedMs",
  "interactionOverheadMs",
] as const;

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
  ttsStartedAt: string | null;
  ttsReadyAt: string | null;
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
  stopToTranslationVisibleMs: number | null;
  translationReadyToTtsReadyMs: number | null;
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

export function sanitizeClassicReportError(message: string) {
  return message
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
  connectionSetupMs: number | null;
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
    ttsStartedAt: d.ttsStartedAt ?? null,
    ttsReadyAt: d.ttsReadyAt ?? null,
    playbackStartedAt: d.playbackStartedAt ?? null,
    playbackCompletedAt: d.playbackCompletedAt ?? null,
    recordClickToGetUserMediaReadyMs: finite(d.recordClickToGetUserMediaReadyMs),
    recordClickToMicReadyMs: finite(d.recordClickToMicReadyMs),
    recordClickToRecordingStartedMs: finite(d.recordClickToRecordingStartedMs),
    getUserMediaToRecordingStartedMs: finite(d.getUserMediaToRecordingStartedMs),
    realtimeSetupMs: finite(d.realtimeSetupMs) ?? input.connectionSetupMs,
    recordingDurationMs: finite(d.recordingDurationMs),
    stopToTranscriptFinalMs: finite(d.stopToTranscriptFinalMs),
    transcriptFinalToTranslationReadyMs: finite(
      d.transcriptFinalToTranslationReadyMs,
    ),
    stopToTranslationVisibleMs: finite(d.stopToTranslationVisibleMs),
    translationReadyToTtsReadyMs: finite(d.translationReadyToTtsReadyMs),
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
  const attemptByConnectionId = new Map(
    sourceConnectionAttempts
      .filter((attempt) => attempt.status === "success")
      .map((attempt) => [attempt.connectionId, attempt]),
  );
  const successfulTurns = input.entries.map((entry) => {
    const diagnostics: Partial<TranslationDiagnostics> = entry.diagnostics ?? {};
    const attempt = diagnostics.connectionId
      ? attemptByConnectionId.get(diagnostics.connectionId)
      : undefined;
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
      connectionSetupMs: attempt?.totalSetupMs ?? null,
      errorStage: null,
      errorType: null,
      errorCode: null,
      sanitizedErrorMessage: null,
    });
  });
  const failedTurns = input.failedTurns.map((turn) => {
    const attempt = turn.diagnostics.connectionId
      ? attemptByConnectionId.get(turn.diagnostics.connectionId)
      : undefined;
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
      connectionSetupMs: attempt?.totalSetupMs ?? null,
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

  return {
    reportVersion: REPORT_VERSION,
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
    transcriptionModels,
    connectionAttempts,
    performanceSummary: {
      allSuccessfulTurns: performanceGroup(successful),
      realtimeTurns: performanceGroup(realtime),
      audioUploadFallbackTurns: performanceGroup(fallback),
      warmReusedRealtimeTurns: performanceGroup(warmRealtime),
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
