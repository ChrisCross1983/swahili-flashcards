import type { LiveLanguage } from "../types";
import type {
  LiveV2LanguageResult,
  LiveV2TranslationResult,
} from "./types";

async function jsonRequest<T>(url: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error("live_v2_request_failed");
  return (await response.json()) as T;
}

export async function detectLiveV2Language(
  authoritativeTranscript: string,
  expectedLanguage: LiveLanguage | null,
  signal: AbortSignal,
) {
  const result = await jsonRequest<LiveV2LanguageResult>(
    "/api/translator/live/v2/detect",
    { authoritativeTranscript, expectedLanguage },
    signal,
  );
  if (!(["de", "sw", "unknown"] as const).includes(result.language)) {
    throw new Error("invalid_language_result");
  }
  return result;
}

export async function translateLiveV2Text(
  authoritativeTranscript: string,
  sourceLanguage: LiveLanguage,
  targetLanguage: LiveLanguage,
  signal: AbortSignal,
) {
  const result = await jsonRequest<LiveV2TranslationResult>(
    "/api/translator/live/v2/translate",
    { authoritativeTranscript, sourceLanguage, targetLanguage },
    signal,
  );
  if (!result.translatedText?.trim()) throw new Error("empty_translation");
  return { ...result, translatedText: result.translatedText.trim() };
}
