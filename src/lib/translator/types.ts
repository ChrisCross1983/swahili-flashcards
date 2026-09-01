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
  ttsStartedAt?: string;
  ttsReadyAt?: string;
  ttsClientRequestStartedAt?: string;
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
  firstPlayableAudioAt?: string;
  playRequestedAt?: string;
  ttsRequestCorrelationId?: string;
  translationVisibleToTtsRequestStartMs?: number;
  ttsClientToServerMs?: number;
  ttsServerPreOpenAiMs?: number;
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
};

export type TranslationEntry = {
  id: string;
  timestamp: number;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  originalText: string;
  translatedText: string;
  sourceWasDetected: boolean;
  diagnostics?: TranslationDiagnostics;
};

export type TranslationResult = {
  originalText: string;
  translatedText: string;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  diagnostics: TranslationDiagnostics;
};

export type TranslatorApiErrorCode =
  | "invalid_request"
  | "invalid_direction"
  | "invalid_audio_format"
  | "audio_too_large"
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
