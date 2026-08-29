export type LiveLanguage = "de" | "sw";
export type LiveDetectedLanguage = LiveLanguage | "unknown";

export type LiveConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type LiveConversationPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "recognizing"
  | "translating"
  | "speaking"
  | "error";

export type LiveTurnStatus =
  | "success"
  | "unknown"
  | "detect_error"
  | "empty"
  | "discarded"
  | "ignored"
  | "technical_error";

export type LiveDetectionStatus =
  | "not_attempted"
  | "success"
  | "unknown"
  | "error"
  | "skipped";

export type LiveTranscriptTurn = {
  turnId: string;
  startedAt: string;
  endedAt: string | null;
  status: LiveTurnStatus;
  sourceLanguage: LiveLanguage | "unknown" | null;
  targetLanguage: LiveLanguage | null;
  sourceTranscript: string;
  translatedTranscript: string;
  detectedLanguage: LiveDetectedLanguage;
  detectionStatus: LiveDetectionStatus;
  detectHttpStatus: number | null;
  detectErrorCode: string | null;
  selectedSidecar: LiveLanguage | null;
  discardedSidecar: LiveLanguage | null;
  turnDurationMs: number | null;
  silenceDurationMs: number | null;
  speechEndToFirstTranslationMs: number | null;
  speechEndToFirstAudioMs: number | null;
  speechEndToTranslationCompleteMs: number | null;
  speechEndToAudioCompleteMs: number | null;
  speechEndToPlaybackStartedMs: number | null;
  speechStartToFirstTranslationMs: number | null;
  firstTranslationRelativeToSpeechEndMs: number | null;
  firstAudioRelativeToSpeechEndMs: number | null;
  firstRemoteAudioAt: string | null;
  selectedAudioReadyAt: string | null;
  playbackStartedAt: string | null;
  audioCompletedAt: string | null;
  playbackStarted: boolean;
  playbackStopped: boolean;
  errorCode: string | null;
  sidecars: Record<LiveLanguage, LiveSidecarQaData>;
};

export type LiveSidecarQaData = {
  sourceTranscript: string;
  translatedTranscript: string;
  transcriptStartedAt: string | null;
  transcriptCompletedAt: string | null;
  hadRemoteAudio: boolean;
  remoteTrackReceived: boolean;
  audioCaptureStarted: boolean;
  audioBlobSize: number | null;
  audioErrorCode: string | null;
};

export type LiveSessionSummary = {
  totalTurns: number;
  successfulTurns: number;
  failedTurns: number;
  unknownTurns: number;
  detectErrors: number;
  discardedTurns: number;
  deTurns: number;
  swTurns: number;
  avgSpeechEndToFirstTranslationMs: number | null;
  avgSpeechEndToFirstAudioMs: number | null;
  medianSpeechEndToFirstTranslationMs: number | null;
  medianSpeechEndToFirstAudioMs: number | null;
};

export type LiveSessionReport = {
  session: {
    sessionId: string;
    startedAt: string;
    endedAt: string | null;
    userAgent: string;
    platform: string;
    turnSilenceMs: number;
  } & LiveSessionSummary;
  turns: LiveTranscriptTurn[];
};

export type LiveTurnPerformance = {
  sourceLanguage: LiveLanguage;
  targetLanguage: LiveLanguage;
  speechEndToFirstTranslationMs: number | null;
  speechEndToFirstAudioMs: number | null;
  speechEndToTranslationCompleteMs: number | null;
  speechEndToAudioCompleteMs: number | null;
  speechStartToFirstTranslationMs: number | null;
  speechStartToFirstAudioMs: number | null;
  speechEndToPlaybackStartedMs: number | null;
  firstTranslationRelativeToSpeechEndMs: number | null;
  firstAudioRelativeToSpeechEndMs: number | null;
};

export type LiveClientSnapshot = {
  phase: LiveConversationPhase;
  connectionStatus: LiveConnectionStatus;
  detectedLanguage: LiveDetectedLanguage;
  targetLanguage: LiveLanguage | null;
  transcript: LiveTranscriptTurn[];
  error: string | null;
  audioPlaying: boolean;
  sessionId: string | null;
};

export type LiveSessionCredential = {
  targetLanguage: LiveLanguage;
  clientSecret: string;
  expiresAt: number;
};

export type LiveSessionResponse = {
  sessions: LiveSessionCredential[];
};
