export const TRANSLATOR_CORRELATION_HEADER = "X-Translator-Correlation-Id";
export const TRANSLATION_TIMING_HEADER = "X-Translator-Translation-Timing";
export const SPEECH_TIMING_HEADER = "X-Translator-Speech-Timing";

export function validCorrelationId(value: string | null) {
  if (!value || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) return null;
  return value;
}

export function createCorrelationId(prefix: "translation" | "tts") {
  const id = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

export function parseTimingHeader<T extends Record<string, unknown>>(
  value: string | null,
): Partial<T> {
  if (!value || value.length > 4_000) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Partial<T> : {};
  } catch {
    return {};
  }
}

export function serverTimingHeader(metrics: Record<string, number | null>) {
  return Object.entries(metrics)
    .filter((entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0,
    )
    .map(([name, value]) => `${name};dur=${Math.round(value * 10) / 10}`)
    .join(", ");
}
