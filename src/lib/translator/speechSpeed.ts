export const DEFAULT_SPEECH_SPEED = 1;
export const MIN_SPEECH_SPEED = 0.8;
export const MAX_SPEECH_SPEED = 1.2;
export const SPEECH_SPEED_STEP = 0.05;

export function isValidSpeechSpeed(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_SPEECH_SPEED &&
    value <= MAX_SPEECH_SPEED
  );
}

export function getSpeechCacheKey(entryId: string, speed: number) {
  return `${entryId}:${speed.toFixed(2)}`;
}

export function formatSpeechSpeed(speed: number) {
  return speed.toFixed(2).replace(/0$/, "");
}
