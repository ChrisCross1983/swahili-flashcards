export type TranslationLanguage = "de" | "sw";

export type TranslationMode = "auto" | "de-to-sw" | "sw-to-de";

export type TranslationDirection = {
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
};

export type TranslationRequestDirection =
  | TranslationDirection
  | { sourceLanguage: "auto"; targetLanguage: "auto" };

export type TranscriptionPath = "realtime" | "audio_upload_fallback";

export type TtsRequestReason = "autoplay" | "manual_play" | "none";
export type TtsGenerationOutcome =
  | "not_requested"
  | "disabled"
  | "request_started"
  | "success"
  | "request_failed"
  | "aborted"
  | "stale_result"
  | "playback_blocked"
  | "playback_failed";
export type TtsPlaybackOutcome =
  | "not_attempted"
  | "started"
  | "completed"
  | "interrupted"
  | "blocked"
  | "failed";

export type TranslationDiagnostics = {
  transcriptionModel: string;
  translationModel: string;
  transcriptionMs: number;
  translationMs?: number;
  autoTranslateMs?: number;
  serverTranslationTotalMs: number;
  /** Legacy field accepted from older feedback/API payloads. */
  totalMs?: number;
  transcriptionFallbackUsed: boolean;
  detectedLanguage: TranslationLanguage | null;
  recordButtonClickedAt?: string;
  getUserMediaStartedAt?: string;
  getUserMediaReadyAt?: string;
  mediaRecorderPreparedAt?: string;
  recordClickToGetUserMediaReadyMs?: number;
  recordClickToMicReadyMs?: number;
  recordClickToRecordingStartedMs?: number;
  getUserMediaToRecordingStartedMs?: number;
  realtimeSetupStartedAt?: string;
  realtimeConnectionReadyAt?: string;
  realtimeSetupMs?: number;
  recordingStartedAt?: string;
  recordingStoppedAt?: string;
  recordingDurationMs?: number;
  firstTranscriptDeltaAt?: string;
  transcriptFinalAt?: string;
  stopToTranscriptFinalMs?: number;
  translationStartedAt?: string;
  translationReadyAt?: string;
  translationClientRequestStartedAt?: string;
  translationRouteReceivedAt?: string | null;
  translationAuthStartedAt?: string | null;
  translationAuthCompletedAt?: string | null;
  translationAuthClientPreparationStartedAt?: string | null;
  translationAuthClientPreparationCompletedAt?: string | null;
  translationAuthUserLookupStartedAt?: string | null;
  translationAuthUserLookupCompletedAt?: string | null;
  translationBodyReadStartedAt?: string | null;
  translationBodyReadCompletedAt?: string | null;
  translationJsonParseStartedAt?: string | null;
  translationJsonParseCompletedAt?: string | null;
  translationValidationStartedAt?: string | null;
  translationValidationCompletedAt?: string | null;
  translationInputNormalizationStartedAt?: string | null;
  translationInputNormalizationCompletedAt?: string | null;
  translationServiceEnteredAt?: string | null;
  translationPromptPreparationStartedAt?: string | null;
  translationPromptPreparationCompletedAt?: string | null;
  translationSchemaPreparationStartedAt?: string | null;
  translationSchemaPreparationCompletedAt?: string | null;
  translationOpenAiClientReadyAt?: string | null;
  translationServerRequestReceivedAt?: string;
  translationServerParsingDoneAt?: string;
  translationOpenAiRequestStartedAt?: string;
  translationOpenAiFirstEventAt?: string;
  translationOpenAiFirstByteAt?: string;
  translationOpenAiCompletedAt?: string;
  translationServerSerializationDoneAt?: string;
  translationServerResponseStartedAt?: string;
  translationClientResponseFirstByteAt?: string;
  translationClientResponseCompletedAt?: string;
  translationStateCommittedAt?: string;
  translationVisibleAt?: string;
  translationRequestCorrelationId?: string;
  clientToTranslationServerMs?: number;
  translationClientToServerMs?: number;
  translationServerPreOpenAiMs?: number;
  translationAuthMs?: number | null;
  translationAuthClientPreparationMs?: number | null;
  translationAuthUserLookupMs?: number | null;
  translationBodyReadMs?: number | null;
  translationJsonParseMs?: number | null;
  translationValidationMs?: number | null;
  translationNormalizationMs?: number | null;
  translationPromptPreparationMs?: number | null;
  translationSchemaPreparationMs?: number | null;
  translationOpenAiClientPreparationMs?: number | null;
  translationOtherPreOpenAiMs?: number | null;
  translationOpenAiFirstResponseMs?: number;
  translationOpenAiTotalMs?: number;
  translationServerPostOpenAiMs?: number;
  translationServerToClientMs?: number;
  translationClientPostResponseMs?: number;
  transcriptFinalToTranslationRequestStartMs?: number;
  translationRequestToVisibleMs?: number;
  transcriptFinalToTranslationVisibleMs?: number;
  translationRequestMs?: number;
  transcriptFinalToTranslationReadyMs?: number;
  stopToTranslationVisibleMs?: number;
  ttsDecisionAt?: string;
  ttsRequested?: boolean;
  ttsRequestReason?: TtsRequestReason;
  ttsGenerationOutcome?: TtsGenerationOutcome;
  ttsPlaybackOutcome?: TtsPlaybackOutcome;
  ttsOutcome?: TtsGenerationOutcome;
  ttsSkipReason?: string | null;
  ttsRequestedAt?: string;
  ttsStartedAt?: string;
  ttsReadyAt?: string;
  ttsClientRequestStartedAt?: string;
  ttsRouteReceivedAt?: string | null;
  ttsAuthStartedAt?: string | null;
  ttsAuthCompletedAt?: string | null;
  ttsAuthClientPreparationStartedAt?: string | null;
  ttsAuthClientPreparationCompletedAt?: string | null;
  ttsAuthUserLookupStartedAt?: string | null;
  ttsAuthUserLookupCompletedAt?: string | null;
  ttsBodyReadStartedAt?: string | null;
  ttsBodyReadCompletedAt?: string | null;
  ttsJsonParseStartedAt?: string | null;
  ttsJsonParseCompletedAt?: string | null;
  ttsValidationStartedAt?: string | null;
  ttsValidationCompletedAt?: string | null;
  ttsInputNormalizationStartedAt?: string | null;
  ttsInputNormalizationCompletedAt?: string | null;
  ttsServiceEnteredAt?: string | null;
  ttsInstructionPreparationStartedAt?: string | null;
  ttsInstructionPreparationCompletedAt?: string | null;
  ttsOpenAiClientReadyAt?: string | null;
  ttsServerRequestReceivedAt?: string;
  ttsServerParsingDoneAt?: string;
  ttsOpenAiRequestStartedAt?: string;
  ttsOpenAiFirstByteAt?: string | null;
  ttsOpenAiCompletedAt?: string | null;
  ttsServerFirstByteSentAt?: string | null;
  ttsServerCompletedAt?: string | null;
  ttsClientFirstByteAt?: string;
  ttsClientResponseCompletedAt?: string;
  ttsAudioPreparationStartedAt?: string;
  ttsAudioPreparationCompletedAt?: string;
  ttsGenerationCompletedAt?: string;
  firstPlayableAudioAt?: string;
  playRequestedAt?: string;
  ttsPlaybackRequestedAt?: string;
  ttsRequestCorrelationId?: string;
  translationVisibleToTtsRequestStartMs?: number;
  ttsClientToServerMs?: number;
  ttsServerPreOpenAiMs?: number;
  ttsAuthMs?: number | null;
  ttsAuthClientPreparationMs?: number | null;
  ttsAuthUserLookupMs?: number | null;
  ttsBodyReadMs?: number | null;
  ttsJsonParseMs?: number | null;
  ttsValidationMs?: number | null;
  ttsNormalizationMs?: number | null;
  ttsInstructionPreparationMs?: number | null;
  ttsOpenAiClientPreparationMs?: number | null;
  ttsOtherPreOpenAiMs?: number | null;
  ttsOpenAiTimeToFirstByteMs?: number | null;
  ttsOpenAiTotalMs?: number | null;
  ttsServerStreamingOverheadMs?: number | null;
  ttsServerToClientFirstByteMs?: number;
  ttsClientDownloadTotalMs?: number;
  ttsAudioPreparationMs?: number;
  ttsPlayCallToStartedMs?: number;
  translationReadyToPlaybackStartedMs?: number;
  translationReadyToFirstPlayableAudioMs?: number;
  translationVisibleToFirstPlayableAudioMs?: number;
  stopToFirstPlayableAudioMs?: number;
  ttsModel?: string;
  ttsGenerationMs?: number;
  ttsRequestToReadyMs?: number;
  ttsRequestMs?: number;
  translationReadyToTtsReadyMs?: number;
  translationVisibleToTtsReadyMs?: number;
  stopToTtsReadyMs?: number;
  playbackStartedAt?: string;
  playbackCompletedAt?: string;
  ttsPlaybackStartedAt?: string;
  ttsPlaybackCompletedAt?: string;
  ttsPlaybackInterruptedAt?: string;
  /** Correlates a generated/cached audio asset with its playback attempt. */
  ttsGenerationId?: string;
  ttsPlaybackAttemptId?: string;
  ttsPlaybackFromCache?: boolean;
  ttsAudioByteLength?: number;
  ttsAudioMimeType?: string | null;
  ttsInputTextLength?: number;
  ttsPlaybackCurrentTimeAtEnd?: number | null;
  ttsPlaybackDurationAtEnd?: number | null;
  ttsPlaybackCurrentTimeAtInterrupt?: number | null;
  ttsPlaybackDurationAtInterrupt?: number | null;
  ttsReadyToPlaybackStartedMs?: number;
  stopToPlaybackStartedMs?: number;
  interactionOverheadMs?: number;
  transcriptionPath?: TranscriptionPath;
  fallbackReason?: string;
  transcriptionPathDecisionAt?: string;
  transcriptionPathDecisionReason?: string;
  connectionId?: string;
  realtimeConnectionReadyAtRecordingStart?: string;
  realtimeConnectionReused?: boolean;
  realtimeConnectionAgeAtRecordingStartMs?: number;
  warmStart?: boolean;
  ttsSpeed?: number;
  autoplayEnabled?: boolean;
  autoplayBlocked?: boolean;
  translationStreamingUsed?: boolean;
  ttsStreamingUsed?: boolean;
  earlyTtsUsed?: boolean;
  streamingFallbackReason?: string;
  microphoneAcquisitionAttemptId?: string | null;
  microphoneAcquisitionStartedAt?: string | null;
  microphoneAcquisitionCompletedAt?: string | null;
  microphoneAcquisitionMs?: number | null;
  microphoneAcquisitionOutcome?: string | null;
  captureGeneration?: number | null;
  freshStreamRequested?: boolean;
  streamReused?: boolean;
  trackReadyStateAtAcquisition?: string | null;
  trackEnabledAtAcquisition?: boolean | null;
  trackMutedAtAcquisition?: boolean | null;
  mediaRecorderChunkCount?: number;
  mediaRecorderTotalChunkBytes?: number;
  audioBlobSize?: number | null;
  audioSignalObserved?: boolean | null;
  audioSignalEvidence?: "measured" | "inferred_from_valid_audio" | "unavailable";
  realtimeTransportReady?: boolean;
  realtimeInputTrackGeneration?: number | null;
  realtimeFirstDeltaObserved?: boolean;
  realtimeFinalTranscriptReceived?: boolean;
  capturePathOutcome?: string | null;
  sttRoutingDecision?: import("@/lib/translator/sttRouting").SttRoutingDecision;
  primaryTranscript?: string | null;
  primaryTranscriptionPath?: TranscriptionPath | null;
  primaryTranscriptionModel?: string | null;
  rescueTranscript?: string | null;
  rescueTranscriptionPath?: "audio_upload_fallback" | null;
  rescueTranscriptionModel?: string | null;
  finalTranscript?: string | null;
  finalTranscriptionPath?: TranscriptionPath | null;
  finalTranscriptionModel?: string | null;
  primaryFailureToRescueStartMs?: number | null;
  rescueTranscriptionMs?: number | null;
  rescueTranscriptToTranslationReadyMs?: number | null;
  semanticRescueTotalMs?: number | null;
  transcriptScriptAnomalyDetected?: boolean;
  trackRebindStartedAt?: string | null;
  trackRebindCompletedAt?: string | null;
  trackRebindMs?: number | null;
  trackRebindOutcome?:
    | "success"
    | "temporary_disconnect_recovered"
    | "connection_failed"
    | "timeout"
    | "sender_unavailable"
    | "stale_generation";
  senderHadTrackBeforeRebind?: boolean | null;
  connectionStateBeforeRebind?: RTCPeerConnectionState | null;
  connectionStateAfterRebind?: RTCPeerConnectionState | null;
  realtimeConnectionStateTimeline?: Array<{
    at: string;
    connectionState: RTCPeerConnectionState;
    iceConnectionState: RTCIceConnectionState;
    signalingState: RTCSignalingState;
    reasonContext: string;
    event?: string;
  }>;
  summaryEligible?: boolean;
  summaryGenerated?: boolean;
  summaryLength?: number;
  summaryCompressionRatio?: number | null;
  summaryCriticalFactWarningCount?: number;
  summaryContradictionDetected?: boolean;
  summaryGenerationOutcome?: import("@/lib/translator/essenceSummary").SummaryGenerationOutcome;
};

export type TranslationEntry = {
  id: string;
  timestamp: number;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  originalText: string;
  translatedText: string;
  essenceSummary?: string | null;
  sourceWasDetected: boolean;
  diagnostics?: TranslationDiagnostics;
};

export type TranslationResult = {
  originalText: string;
  translatedText: string;
  essenceSummary?: string | null;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  diagnostics: TranslationDiagnostics;
};

export type TranslatorApiErrorCode =
  | "invalid_request"
  | "invalid_direction"
  | "invalid_audio_format"
  | "audio_too_large"
  | "invalid_audio_capture"
  | "no_audio_captured"
  | "no_speech"
  | "unsupported_language"
  | "transcription_failed"
  | "translation_failed"
  | "service_unavailable";

export type TranslatorStatus =
  | "idle"
  | "recording"
  | "processing"
  | "playing"
  | "paused"
  | "error";
