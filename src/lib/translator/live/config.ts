export type LivePipeline = "v1" | "v2";

/** V1 remains available as a legacy path; BETA/development uses V2. */
export const LIVE_PIPELINE: LivePipeline = "v2";

export const LIVE_TRANSLATOR_BETA = {
  enabled: true,
  model: "gpt-realtime-translate",
  transcriptionModel: "gpt-realtime-whisper",
  languageDetectionModel: "gpt-5.6-terra",
  endpoint: "https://api.openai.com/v1/realtime/translations/calls",
  sessionEndpoint:
    "https://api.openai.com/v1/realtime/translations/client_secrets",
  clientSecretTtlSeconds: 600,
  dataChannelOpenTimeoutMs: 10_000,
  sdpMaxAttempts: 4,
  sdpRetryBackoffMs: [1_000, 2_000, 4_000],
  sdpRetryAfterMaxMs: 30_000,
} as const;

/**
 * Client-side turn detection. The Realtime Translation API currently streams
 * continuously and does not expose the server_vad/semantic_vad configuration
 * used by assistant sessions.
 */
export const LIVE_TURN_SILENCE_MS = 1_000;

export const LIVE_TURN_DETECTION = {
  sampleIntervalMs: 50,
  speechRmsThreshold: 0.025,
  speechStartFrames: 4,
  minimumSpeechActivityMs: 300,
  endOfTurnSilenceMs: LIVE_TURN_SILENCE_MS,
  outputTailSilenceMs: 650,
  outputDrainTimeoutMs: 4_000,
  transcriptSettleMs: 200,
  remoteAudioRmsThreshold: 0.003,
  recorderStopTimeoutMs: 1_500,
} as const;

export const LIVE_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};
