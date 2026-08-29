import { LIVE_AUDIO_CONSTRAINTS, LIVE_TURN_SILENCE_MS } from "../config";

export const LIVE_V2_CONFIG = {
  pipelineVersion: "v2",
  transcriptionModel: "gpt-live-transcribe",
  translationModel: "gpt-5.6-terra",
  ttsModel: "gpt-4o-mini-tts",
  realtimeCallsEndpoint: "https://api.openai.com/v1/realtime/calls",
  clientSecretEndpoint: "https://api.openai.com/v1/realtime/client_secrets",
  clientSecretTtlSeconds: 600,
  dataChannelOpenTimeoutMs: 10_000,
  sdpMaxAttempts: 4,
  sdpRetryBackoffMs: [1_000, 2_000, 4_000],
  sdpRetryAfterMaxMs: 30_000,
  sdpRetryStatuses: [429, 500, 502, 503, 504],
  transcriptFinalTimeoutMs: 10_000,
  turnSilenceMs: LIVE_TURN_SILENCE_MS,
  ttsSpeed: { min: 0.8, max: 1.2, step: 0.05, default: 1 },
  expectedLanguages: ["de", "sw"],
  keywords: [
    "ndiyo",
    "hapana",
    "asante",
    "sana",
    "habari",
    "asubuhi",
    "mchana",
    "jioni",
    "usiku",
    "unaendeleaje",
    "hakuna matata",
    "pole",
    "tafadhali",
    "nina",
    "wewe",
    "leo",
    "kesho",
    "kuzungumza",
    "Kiswahili",
    "Swahili",
  ],
  transcriptionPrompt:
    "Expected speech is German or Tanzanian Kiswahili. Transcribe only the words actually spoken. Do not translate, complete, or invent speech.",
  audioConstraints: LIVE_AUDIO_CONSTRAINTS,
} as const;

export type LiveV2TtsSpeed = number;

export function isLiveV2TtsSpeed(value: unknown): value is LiveV2TtsSpeed {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const { min, max, step } = LIVE_V2_CONFIG.ttsSpeed;
  if (value < min || value > max) return false;
  return Math.abs((value - min) / step - Math.round((value - min) / step)) < 1e-8;
}
