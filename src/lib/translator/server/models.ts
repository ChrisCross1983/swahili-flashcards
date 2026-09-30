export const PRIMARY_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
export const FALLBACK_TRANSCRIPTION_MODEL = "whisper-1";
export const SAFE_STT_MODEL_QUALITY_BENCHMARK_MODELS = [
  PRIMARY_TRANSCRIPTION_MODEL,
  FALLBACK_TRANSCRIPTION_MODEL,
] as const;
export const SAFE_STT_MODEL_ACCESS_DIAGNOSTIC_MODELS = [
  "gpt-transcribe",
  "gpt-4o-transcribe",
] as const;
export const SAFE_STT_MODEL_BENCHMARK_MODELS = [
  ...SAFE_STT_MODEL_QUALITY_BENCHMARK_MODELS,
  ...SAFE_STT_MODEL_ACCESS_DIAGNOSTIC_MODELS,
] as const;
export type SafeSttModelBenchmarkCandidate =
  (typeof SAFE_STT_MODEL_BENCHMARK_MODELS)[number];

export function isSafeSttModelBenchmarkCandidate(
  value: string | null,
): value is SafeSttModelBenchmarkCandidate {
  return value !== null && (SAFE_STT_MODEL_BENCHMARK_MODELS as readonly string[]).includes(value);
}
export const TRANSLATION_MODEL = "gpt-5.6-terra";
export const SPEECH_MODEL = "gpt-4o-mini-tts";
export const SPEECH_VOICE = "alloy";
export const SPEECH_RESPONSE_FORMAT = "mp3";
