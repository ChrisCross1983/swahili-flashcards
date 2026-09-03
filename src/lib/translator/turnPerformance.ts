import type {
  TranslationDiagnostics,
  TranscriptionPath,
} from "@/lib/translator/types";

type ClientPerformanceDiagnostics = Pick<
  TranslationDiagnostics,
  | "recordButtonClickedAt"
  | "getUserMediaStartedAt"
  | "getUserMediaReadyAt"
  | "mediaRecorderPreparedAt"
  | "recordClickToGetUserMediaReadyMs"
  | "recordClickToMicReadyMs"
  | "recordClickToRecordingStartedMs"
  | "getUserMediaToRecordingStartedMs"
  | "recordingStartedAt"
  | "realtimeSetupStartedAt"
  | "realtimeConnectionReadyAt"
  | "realtimeSetupMs"
  | "recordingStoppedAt"
  | "recordingDurationMs"
  | "firstTranscriptDeltaAt"
  | "transcriptFinalAt"
  | "stopToTranscriptFinalMs"
  | "translationStartedAt"
  | "translationReadyAt"
  | "translationClientRequestStartedAt"
  | "translationStateCommittedAt"
  | "translationVisibleAt"
  | "transcriptFinalToTranslationRequestStartMs"
  | "translationRequestToVisibleMs"
  | "transcriptFinalToTranslationVisibleMs"
  | "translationClientPostResponseMs"
  | "translationRequestMs"
  | "transcriptFinalToTranslationReadyMs"
  | "stopToTranslationVisibleMs"
  | "ttsStartedAt"
  | "ttsReadyAt"
  | "ttsClientRequestStartedAt"
  | "ttsAudioPreparationStartedAt"
  | "ttsAudioPreparationCompletedAt"
  | "firstPlayableAudioAt"
  | "playRequestedAt"
  | "translationVisibleToTtsRequestStartMs"
  | "ttsAudioPreparationMs"
  | "ttsPlayCallToStartedMs"
  | "translationReadyToPlaybackStartedMs"
  | "translationReadyToFirstPlayableAudioMs"
  | "translationVisibleToFirstPlayableAudioMs"
  | "stopToFirstPlayableAudioMs"
  | "ttsRequestToReadyMs"
  | "ttsRequestMs"
  | "translationReadyToTtsReadyMs"
  | "translationVisibleToTtsReadyMs"
  | "stopToTtsReadyMs"
  | "playbackStartedAt"
  | "playbackCompletedAt"
  | "ttsReadyToPlaybackStartedMs"
  | "stopToPlaybackStartedMs"
  | "interactionOverheadMs"
  | "transcriptionPath"
  | "fallbackReason"
  | "transcriptionPathDecisionAt"
  | "transcriptionPathDecisionReason"
  | "connectionId"
  | "realtimeConnectionReadyAtRecordingStart"
  | "realtimeConnectionReused"
  | "realtimeConnectionAgeAtRecordingStartMs"
  | "warmStart"
  | "microphoneAcquisitionAttemptId"
  | "microphoneAcquisitionStartedAt"
  | "microphoneAcquisitionCompletedAt"
  | "microphoneAcquisitionMs"
  | "microphoneAcquisitionOutcome"
  | "captureGeneration"
  | "freshStreamRequested"
  | "streamReused"
  | "trackReadyStateAtAcquisition"
  | "trackEnabledAtAcquisition"
  | "trackMutedAtAcquisition"
  | "mediaRecorderChunkCount"
  | "mediaRecorderTotalChunkBytes"
  | "audioBlobSize"
  | "audioSignalObserved"
  | "realtimeTransportReady"
  | "realtimeInputTrackGeneration"
  | "realtimeFirstDeltaObserved"
  | "realtimeFinalTranscriptReceived"
  | "capturePathOutcome"
  | "translationRequestCorrelationId"
>;

type TurnTimepointName =
  | "recordButtonClicked"
  | "getUserMediaStarted"
  | "getUserMediaReady"
  | "mediaRecorderPrepared"
  | "transcriptionPathDecision"
  | "realtimeSetupStarted"
  | "realtimeSetupFinished"
  | "realtimeConnectionReady"
  | "recordingStarted"
  | "recordingStopped"
  | "firstTranscriptDelta"
  | "transcriptFinal"
  | "translationRequestStarted"
  | "translationCompleted"
  | "translationClientResponseCompleted"
  | "translationStateCommitted"
  | "translationVisible"
  | "ttsRequestStarted"
  | "ttsAudioPreparationStarted"
  | "ttsAudioPreparationCompleted"
  | "ttsReady"
  | "playRequested"
  | "playbackStarted"
  | "playbackCompleted";

type TurnTimepoints = Partial<Record<TurnTimepointName, number>>;
type TurnTimestamps = Partial<Record<TurnTimepointName, string>>;

function validTime(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function duration(start: number | undefined, end: number | undefined) {
  if (
    start === undefined ||
    end === undefined ||
    !validTime(start) ||
    !validTime(end) ||
    end < start
  ) {
    return undefined;
  }
  return Math.round(end - start);
}

export class TranslatorTurnPerformance {
  private readonly timepoints: TurnTimepoints = {};
  private readonly timestamps: TurnTimestamps = {};
  private transcriptionPath?: TranscriptionPath;
  private fallbackReason?: string;
  private fallbackStopToTranscriptFinalMs?: number;
  private fallbackTranscriptFinalToTranslationReadyMs?: number;
  private realtimeSetupOverrideMs?: number;
  private pathContext: Partial<ClientPerformanceDiagnostics> = {};

  constructor(
    initial:
      | number
      | { recordingStarted: number }
      | { realtimeSetupStarted: number }
      | { recordButtonClicked: number } = performance.now(),
  ) {
    if (typeof initial === "number") {
      this.markOnce("recordingStopped", initial);
    } else if ("realtimeSetupStarted" in initial) {
      this.markOnce("realtimeSetupStarted", initial.realtimeSetupStarted);
    } else if ("recordButtonClicked" in initial) {
      this.markOnce("recordButtonClicked", initial.recordButtonClicked);
    } else {
      this.markOnce("recordingStarted", initial.recordingStarted);
    }
  }

  markRecordButtonClicked(now = performance.now()) {
    this.markOnce("recordButtonClicked", now);
  }

  markGetUserMediaStarted(now = performance.now()) {
    this.markOnce("getUserMediaStarted", now);
  }

  markGetUserMediaReady(now = performance.now()) {
    this.markOnce("getUserMediaReady", now);
  }

  markMediaRecorderPrepared(now = performance.now()) {
    this.markOnce("mediaRecorderPrepared", now);
  }

  markTranscriptionPathDecision(
    context: {
      transcriptionPathDecisionAt: string;
      transcriptionPathDecisionReason: string;
      connectionId: string | null;
      realtimeConnectionReadyAtRecordingStart: string | null;
      realtimeConnectionReused: boolean;
      realtimeConnectionAgeAtRecordingStartMs: number | null;
      warmStart: boolean;
    },
    now = performance.now(),
  ) {
    this.markOnce("transcriptionPathDecision", now);
    this.pathContext = {
      transcriptionPathDecisionAt: context.transcriptionPathDecisionAt,
      transcriptionPathDecisionReason: context.transcriptionPathDecisionReason,
      ...(context.connectionId ? { connectionId: context.connectionId } : {}),
      ...(context.realtimeConnectionReadyAtRecordingStart
        ? {
            realtimeConnectionReadyAtRecordingStart:
              context.realtimeConnectionReadyAtRecordingStart,
          }
        : {}),
      realtimeConnectionReused: context.realtimeConnectionReused,
      ...(context.realtimeConnectionAgeAtRecordingStartMs === null
        ? {}
        : {
            realtimeConnectionAgeAtRecordingStartMs:
              context.realtimeConnectionAgeAtRecordingStartMs,
          }),
      warmStart: context.warmStart,
    };
  }

  markRealtimeSetupStarted(now = performance.now()) {
    this.markOnce("realtimeSetupStarted", now);
  }

  markRealtimeConnectionReady(now = performance.now()) {
    this.markOnce("realtimeConnectionReady", now);
    this.markOnce("realtimeSetupFinished", now);
  }

  markRealtimeSetupFinished(now = performance.now()) {
    this.markOnce("realtimeSetupFinished", now);
  }

  setRealtimeSetupDuration(value: number | null | undefined) {
    if (value !== null && value !== undefined && validTime(value)) {
      this.realtimeSetupOverrideMs = Math.round(value);
    }
  }

  setCaptureDiagnostics(diagnostics: Partial<ClientPerformanceDiagnostics>) {
    this.pathContext = { ...this.pathContext, ...diagnostics };
  }

  markRecordingStarted(now = performance.now()) {
    this.markOnce("recordingStarted", now);
  }

  markRecordingStopped(now = performance.now()) {
    this.markOnce("recordingStopped", now);
  }

  markFirstTranscriptDelta(now = performance.now()) {
    this.markOnce("firstTranscriptDelta", now);
  }

  markTranscriptFinal(now = performance.now()) {
    this.markOnce("transcriptFinal", now);
    return this.getDiagnostics();
  }

  setTranscriptionOutcome(
    path: TranscriptionPath,
    fallbackReason?: string,
  ) {
    this.transcriptionPath = path;
    this.fallbackReason = fallbackReason;
    if (fallbackReason) {
      this.pathContext.transcriptionPathDecisionReason = fallbackReason;
    }
  }

  getRecordingToTranscriptFinalMs() {
    return duration(
      this.timepoints.recordingStarted,
      this.timepoints.transcriptFinal,
    );
  }

  setFallbackServerTimings(diagnostics: {
    transcriptFinalAt?: string;
    translationStartedAt?: string;
    translationReadyAt?: string;
  }) {
    const transcriptFinalMs = diagnostics.transcriptFinalAt
      ? Date.parse(diagnostics.transcriptFinalAt)
      : Number.NaN;
    const recordingStoppedMs = this.timestamps.recordingStopped
      ? Date.parse(this.timestamps.recordingStopped)
      : Number.NaN;
    if (Number.isFinite(transcriptFinalMs)) {
      this.timestamps.transcriptFinal = new Date(transcriptFinalMs).toISOString();
      if (
        Number.isFinite(recordingStoppedMs) &&
        transcriptFinalMs >= recordingStoppedMs
      ) {
        this.fallbackStopToTranscriptFinalMs = Math.round(
          transcriptFinalMs - recordingStoppedMs,
        );
      }
    }
    if (
      diagnostics.translationStartedAt &&
      !this.timestamps.translationRequestStarted
    ) {
      this.timestamps.translationRequestStarted =
        diagnostics.translationStartedAt;
    }
    if (diagnostics.translationReadyAt && !this.timestamps.translationCompleted) {
      this.timestamps.translationCompleted = diagnostics.translationReadyAt;
    }
    if (diagnostics.transcriptFinalAt && diagnostics.translationReadyAt) {
      const transcriptFinal = Date.parse(diagnostics.transcriptFinalAt);
      const translationReady = Date.parse(diagnostics.translationReadyAt);
      if (
        Number.isFinite(transcriptFinal) &&
        Number.isFinite(translationReady) &&
        translationReady >= transcriptFinal
      ) {
        this.fallbackTranscriptFinalToTranslationReadyMs = Math.round(
          translationReady - transcriptFinal,
        );
      }
    }
  }

  markTranslationRequestStarted(now = performance.now()) {
    this.markOnce("translationRequestStarted", now);
  }

  markTranslationCompleted(now = performance.now()) {
    this.markOnce("translationCompleted", now);
  }

  markTranslationClientResponseCompleted(now = performance.now()) {
    this.markOnce("translationClientResponseCompleted", now);
  }

  markTranslationStateCommitted(now = performance.now()) {
    this.markOnce("translationStateCommitted", now);
  }

  markTranslationVisible(now = performance.now()) {
    this.markOnce("translationVisible", now);
    return this.getDiagnostics();
  }

  markTtsRequestStarted(now = performance.now()) {
    this.markOnce("ttsRequestStarted", now);
  }

  markTtsAudioPreparationStarted(now = performance.now()) {
    this.markOnce("ttsAudioPreparationStarted", now);
  }

  markTtsAudioPreparationCompleted(now = performance.now()) {
    this.markOnce("ttsAudioPreparationCompleted", now);
    return this.getDiagnostics();
  }

  markPlayRequested(now = performance.now()) {
    this.markOnce("playRequested", now);
  }

  markTtsReady(now = performance.now()) {
    this.markOnce("ttsReady", now);
    return this.getDiagnostics();
  }

  markPlaybackStarted(now = performance.now()) {
    this.markOnce("playbackStarted", now);
    return this.getDiagnostics();
  }

  markPlaybackCompleted(now = performance.now()) {
    this.markOnce("playbackCompleted", now);
    return this.getDiagnostics();
  }

  getDiagnostics(): Partial<ClientPerformanceDiagnostics> {
    const recordClickToGetUserMediaReadyMs = duration(
      this.timepoints.recordButtonClicked,
      this.timepoints.getUserMediaReady,
    );
    const recordClickToRecordingStartedMs = duration(
      this.timepoints.recordButtonClicked,
      this.timepoints.recordingStarted,
    );
    const getUserMediaToRecordingStartedMs = duration(
      this.timepoints.getUserMediaStarted,
      this.timepoints.recordingStarted,
    );
    const realtimeSetupMs =
      duration(
        this.timepoints.realtimeSetupStarted,
        this.timepoints.realtimeSetupFinished,
      ) ?? this.realtimeSetupOverrideMs;
    const stopToTranscriptFinalMs =
      duration(
        this.timepoints.recordingStopped,
        this.timepoints.transcriptFinal,
      ) ?? this.fallbackStopToTranscriptFinalMs;
    const translationRequestMs = duration(
      this.timepoints.translationRequestStarted,
      this.timepoints.translationCompleted,
    );
    const transcriptFinalToTranslationRequestStartMs = duration(
      this.timepoints.transcriptFinal,
      this.timepoints.translationRequestStarted,
    );
    const translationRequestToVisibleMs = duration(
      this.timepoints.translationRequestStarted,
      this.timepoints.translationVisible,
    );
    const transcriptFinalToTranslationVisibleMs = duration(
      this.timepoints.transcriptFinal,
      this.timepoints.translationVisible,
    );
    const translationClientPostResponseMs = duration(
      this.timepoints.translationClientResponseCompleted,
      this.timepoints.translationVisible,
    );
    const recordingDurationMs = duration(
      this.timepoints.recordingStarted,
      this.timepoints.recordingStopped,
    );
    const transcriptFinalToTranslationReadyMs =
      duration(
        this.timepoints.transcriptFinal,
        this.timepoints.translationCompleted,
      ) ?? this.fallbackTranscriptFinalToTranslationReadyMs;
    const stopToTranslationVisibleMs = duration(
      this.timepoints.recordingStopped,
      this.timepoints.translationVisible,
    );
    const ttsRequestToReadyMs = duration(
      this.timepoints.ttsRequestStarted,
      this.timepoints.ttsReady,
    );
    const translationVisibleToTtsReadyMs = duration(
      this.timepoints.translationVisible,
      this.timepoints.ttsReady,
    );
    const translationReadyToTtsReadyMs = duration(
      this.timepoints.translationCompleted,
      this.timepoints.ttsReady,
    );
    const translationVisibleToTtsRequestStartMs = duration(
      this.timepoints.translationVisible,
      this.timepoints.ttsRequestStarted,
    );
    const ttsAudioPreparationMs = duration(
      this.timepoints.ttsAudioPreparationStarted,
      this.timepoints.ttsAudioPreparationCompleted,
    );
    const translationReadyToFirstPlayableAudioMs = duration(
      this.timepoints.translationCompleted,
      this.timepoints.ttsAudioPreparationCompleted,
    );
    const translationVisibleToFirstPlayableAudioMs = duration(
      this.timepoints.translationVisible,
      this.timepoints.ttsAudioPreparationCompleted,
    );
    const stopToFirstPlayableAudioMs = duration(
      this.timepoints.recordingStopped,
      this.timepoints.ttsAudioPreparationCompleted,
    );
    const stopToTtsReadyMs = duration(
      this.timepoints.recordingStopped,
      this.timepoints.ttsReady,
    );
    const stopToPlaybackStartedMs = duration(
      this.timepoints.recordingStopped,
      this.timepoints.playbackStarted,
    );
    const ttsReadyToPlaybackStartedMs = duration(
      this.timepoints.ttsReady,
      this.timepoints.playbackStarted,
    );
    const ttsPlayCallToStartedMs = duration(
      this.timepoints.playRequested,
      this.timepoints.playbackStarted,
    );
    const translationReadyToPlaybackStartedMs = duration(
      this.timepoints.translationCompleted,
      this.timepoints.playbackStarted,
    );
    const interactionOverheadMs =
      recordClickToRecordingStartedMs !== undefined &&
      stopToPlaybackStartedMs !== undefined
        ? recordClickToRecordingStartedMs + stopToPlaybackStartedMs
        : undefined;

    return {
      ...this.timestampDiagnostic(
        "recordButtonClicked",
        "recordButtonClickedAt",
      ),
      ...this.timestampDiagnostic("getUserMediaStarted", "getUserMediaStartedAt"),
      ...this.timestampDiagnostic("getUserMediaReady", "getUserMediaReadyAt"),
      ...this.timestampDiagnostic(
        "mediaRecorderPrepared",
        "mediaRecorderPreparedAt",
      ),
      ...(recordClickToGetUserMediaReadyMs === undefined
        ? {}
        : {
            recordClickToGetUserMediaReadyMs,
            recordClickToMicReadyMs: recordClickToGetUserMediaReadyMs,
          }),
      ...(recordClickToRecordingStartedMs === undefined
        ? {}
        : { recordClickToRecordingStartedMs }),
      ...(getUserMediaToRecordingStartedMs === undefined
        ? {}
        : { getUserMediaToRecordingStartedMs }),
      ...this.timestampDiagnostic(
        "realtimeSetupStarted",
        "realtimeSetupStartedAt",
      ),
      ...this.timestampDiagnostic(
        "realtimeConnectionReady",
        "realtimeConnectionReadyAt",
      ),
      ...(realtimeSetupMs === undefined ? {} : { realtimeSetupMs }),
      ...this.timestampDiagnostic("recordingStarted", "recordingStartedAt"),
      ...this.timestampDiagnostic("recordingStopped", "recordingStoppedAt"),
      ...(recordingDurationMs === undefined ? {} : { recordingDurationMs }),
      ...this.timestampDiagnostic(
        "firstTranscriptDelta",
        "firstTranscriptDeltaAt",
      ),
      ...this.timestampDiagnostic("transcriptFinal", "transcriptFinalAt"),
      ...(stopToTranscriptFinalMs === undefined
        ? {}
        : { stopToTranscriptFinalMs }),
      ...this.timestampDiagnostic(
        "translationRequestStarted",
        "translationStartedAt",
      ),
      ...this.timestampDiagnostic(
        "translationRequestStarted",
        "translationClientRequestStartedAt",
      ),
      ...this.timestampDiagnostic("translationCompleted", "translationReadyAt"),
      ...this.timestampDiagnostic(
        "translationStateCommitted",
        "translationStateCommittedAt",
      ),
      ...this.timestampDiagnostic("translationVisible", "translationVisibleAt"),
      ...(translationRequestMs === undefined ? {} : { translationRequestMs }),
      ...(transcriptFinalToTranslationReadyMs === undefined
        ? {}
        : { transcriptFinalToTranslationReadyMs }),
      ...(transcriptFinalToTranslationRequestStartMs === undefined
        ? {}
        : { transcriptFinalToTranslationRequestStartMs }),
      ...(translationRequestToVisibleMs === undefined
        ? {}
        : { translationRequestToVisibleMs }),
      ...(transcriptFinalToTranslationVisibleMs === undefined
        ? {}
        : { transcriptFinalToTranslationVisibleMs }),
      ...(translationClientPostResponseMs === undefined
        ? {}
        : { translationClientPostResponseMs }),
      ...(stopToTranslationVisibleMs === undefined
        ? {}
        : { stopToTranslationVisibleMs }),
      ...this.timestampDiagnostic("ttsRequestStarted", "ttsStartedAt"),
      ...this.timestampDiagnostic(
        "ttsRequestStarted",
        "ttsClientRequestStartedAt",
      ),
      ...this.timestampDiagnostic(
        "ttsAudioPreparationStarted",
        "ttsAudioPreparationStartedAt",
      ),
      ...this.timestampDiagnostic(
        "ttsAudioPreparationCompleted",
        "ttsAudioPreparationCompletedAt",
      ),
      ...this.timestampDiagnostic(
        "ttsAudioPreparationCompleted",
        "firstPlayableAudioAt",
      ),
      ...this.timestampDiagnostic("playRequested", "playRequestedAt"),
      ...this.timestampDiagnostic("ttsReady", "ttsReadyAt"),
      ...(ttsRequestToReadyMs === undefined ? {} : { ttsRequestToReadyMs }),
      ...(ttsRequestToReadyMs === undefined
        ? {}
        : { ttsRequestMs: ttsRequestToReadyMs }),
      ...(translationReadyToTtsReadyMs === undefined
        ? {}
        : { translationReadyToTtsReadyMs }),
      ...(translationVisibleToTtsReadyMs === undefined
        ? {}
        : { translationVisibleToTtsReadyMs }),
      ...(translationVisibleToTtsRequestStartMs === undefined
        ? {}
        : { translationVisibleToTtsRequestStartMs }),
      ...(ttsAudioPreparationMs === undefined ? {} : { ttsAudioPreparationMs }),
      ...(translationReadyToFirstPlayableAudioMs === undefined
        ? {}
        : { translationReadyToFirstPlayableAudioMs }),
      ...(translationVisibleToFirstPlayableAudioMs === undefined
        ? {}
        : { translationVisibleToFirstPlayableAudioMs }),
      ...(stopToFirstPlayableAudioMs === undefined
        ? {}
        : { stopToFirstPlayableAudioMs }),
      ...(stopToTtsReadyMs === undefined ? {} : { stopToTtsReadyMs }),
      ...this.timestampDiagnostic("playbackStarted", "playbackStartedAt"),
      ...this.timestampDiagnostic("playbackCompleted", "playbackCompletedAt"),
      ...(ttsReadyToPlaybackStartedMs === undefined
        ? {}
        : { ttsReadyToPlaybackStartedMs }),
      ...(ttsPlayCallToStartedMs === undefined
        ? {}
        : { ttsPlayCallToStartedMs }),
      ...(translationReadyToPlaybackStartedMs === undefined
        ? {}
        : { translationReadyToPlaybackStartedMs }),
      ...(stopToPlaybackStartedMs === undefined
        ? {}
        : { stopToPlaybackStartedMs }),
      ...(interactionOverheadMs === undefined ? {} : { interactionOverheadMs }),
      ...(this.transcriptionPath
        ? { transcriptionPath: this.transcriptionPath }
        : {}),
      ...(this.fallbackReason ? { fallbackReason: this.fallbackReason } : {}),
      ...this.pathContext,
    };
  }

  private timestampDiagnostic(
    timepoint: TurnTimepointName,
    key:
      | "recordButtonClickedAt"
      | "getUserMediaStartedAt"
      | "getUserMediaReadyAt"
      | "mediaRecorderPreparedAt"
      | "realtimeSetupStartedAt"
      | "realtimeConnectionReadyAt"
      | "recordingStartedAt"
      | "recordingStoppedAt"
      | "firstTranscriptDeltaAt"
      | "transcriptFinalAt"
      | "translationStartedAt"
      | "translationReadyAt"
      | "translationClientRequestStartedAt"
      | "translationStateCommittedAt"
      | "translationVisibleAt"
      | "ttsStartedAt"
      | "ttsClientRequestStartedAt"
      | "ttsAudioPreparationStartedAt"
      | "ttsAudioPreparationCompletedAt"
      | "firstPlayableAudioAt"
      | "playRequestedAt"
      | "ttsReadyAt"
      | "playbackStartedAt"
      | "playbackCompletedAt",
  ): Record<string, string> {
    const timestamp = this.timestamps[timepoint];
    return timestamp ? { [key]: timestamp } : {};
  }

  private markOnce(name: TurnTimepointName, value: number) {
    if (this.timepoints[name] === undefined && validTime(value)) {
      this.timepoints[name] = value;
      this.timestamps[name] = new Date().toISOString();
    }
  }
}
