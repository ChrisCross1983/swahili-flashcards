import type { LiveDetectedLanguage, LiveLanguage } from "../types";

export type LiveV2Phase =
  | "idle"
  | "connecting"
  | "listening"
  | "recognizing"
  | "translating"
  | "speaking"
  | "error";

export type LiveV2ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type LiveV2TurnStatus =
  | "success"
  | "unknown"
  | "empty"
  | "discarded"
  | "technical_error";

export type LiveV2ClassificationSource = "terra" | "none";

export type LiveV2Turn = {
  pipelineVersion: "v2";
  turnId: string;
  status: LiveV2TurnStatus;
  errorCode: string | null;
  authoritativeTranscript: string;
  expectedLanguage: LiveLanguage | null;
  detectedLanguage: LiveDetectedLanguage;
  classificationSource: LiveV2ClassificationSource;
  targetLanguage: LiveLanguage | null;
  translatedText: string;
  transcriptionModel: string;
  translationModel: string;
  ttsModel: string;
  ttsSpeed: number;
  silenceDurationMs: number | null;
  speechStartAt: string;
  speechEndAt: string | null;
  firstTranscriptDeltaAt: string | null;
  transcriptFinalAt: string | null;
  languageResolvedAt: string | null;
  translationStartedAt: string | null;
  translationCompletedAt: string | null;
  ttsStartedAt: string | null;
  firstAudioAt: string | null;
  audioCompletedAt: string | null;
  speechEndToTranscriptFinalMs: number | null;
  speechEndToLanguageResolvedMs: number | null;
  speechEndToTranslationMs: number | null;
  speechEndToFirstAudioMs: number | null;
  totalTurnMs: number | null;
};

export type LiveV2SessionSummary = {
  totalTurns: number;
  successfulTurns: number;
  failedTurns: number;
  unknownTurns: number;
  discardedTurns: number;
  deTurns: number;
  swTurns: number;
  avgSpeechEndToTranscriptFinalMs: number | null;
  avgSpeechEndToLanguageResolvedMs: number | null;
  avgSpeechEndToTranslationMs: number | null;
  avgSpeechEndToFirstAudioMs: number | null;
};

export type LiveV2SessionReport = {
  session: {
    pipelineVersion: "v2";
    sessionId: string;
    startedAt: string;
    endedAt: string | null;
    userAgent: string;
    platform: string;
    turnSilenceMs: number;
    transcriptionModel: string;
    translationModel: string;
    ttsModel: string;
    ttsSpeed: number;
    realtimeRequestIds: string[];
  } & LiveV2SessionSummary;
  turns: LiveV2Turn[];
};

export type LiveV2Snapshot = {
  pipelineVersion: "v2";
  phase: LiveV2Phase;
  connectionStatus: LiveV2ConnectionStatus;
  authoritativeTranscript: string;
  expectedLanguage: LiveLanguage | null;
  detectedLanguage: LiveDetectedLanguage;
  targetLanguage: LiveLanguage | null;
  turns: LiveV2Turn[];
  error: string | null;
  audioPlaying: boolean;
  sessionId: string | null;
  ttsSpeed: number;
};

export type LiveV2SessionCredential = {
  clientSecret: string;
  expiresAt: number;
  transcriptionModel: string;
};

export type LiveV2LanguageResult = {
  language: LiveDetectedLanguage;
  classificationSource: "terra";
};

export type LiveV2TranslationResult = {
  translatedText: string;
  translationModel: string;
};
