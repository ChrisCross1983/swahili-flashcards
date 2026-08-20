import type { TranslationLanguage } from "@/lib/translator/types";

const SPEECH_ERROR_MESSAGE = "Die Sprachausgabe konnte nicht erstellt werden.";
const SPEECH_READY_MESSAGE = "Audio ist bereit. Tippe auf Abspielen.";
const SPEECH_PLAYBACK_ERROR_MESSAGE = "Die Wiedergabe ist gerade nicht möglich.";

export type TranslatorSpeechFailureKind =
  | "generation"
  | "autoplay-blocked"
  | "playback";

export type TranslatorSpeechGenerationDiagnostics = {
  ttsModel: string;
  ttsGenerationMs: number;
};

export type TranslatorSpeechAsset = {
  audio: Blob;
  diagnostics: TranslatorSpeechGenerationDiagnostics;
};

export class TranslatorSpeechClientError extends Error {
  constructor(message = SPEECH_ERROR_MESSAGE) {
    super(message);
    this.name = "TranslatorSpeechClientError";
  }
}

export function getSpeechErrorName(error: unknown) {
  if (!error || typeof error !== "object" || !("name" in error)) {
    return "UnknownError";
  }
  return typeof error.name === "string" ? error.name : "UnknownError";
}

export function isSpeechPlaybackBlockedError(error: unknown) {
  if (getSpeechErrorName(error) === "NotAllowedError") return true;
  if (!error || typeof error !== "object" || !("message" in error)) {
    return false;
  }
  const message =
    typeof error.message === "string" ? error.message.toLowerCase() : "";
  return (
    message.includes("autoplay") ||
    message.includes("user gesture") ||
    message.includes("user interaction") ||
    message.includes("user didn't interact") ||
    message.includes("not allowed by the user agent")
  );
}

export function getTranslatorSpeechFailure(
  error: unknown,
  automatic: boolean,
): { kind: TranslatorSpeechFailureKind; message: string } {
  if (error instanceof TranslatorSpeechClientError) {
    return { kind: "generation", message: SPEECH_ERROR_MESSAGE };
  }
  if (automatic && isSpeechPlaybackBlockedError(error)) {
    return { kind: "autoplay-blocked", message: SPEECH_READY_MESSAGE };
  }
  return { kind: "playback", message: SPEECH_PLAYBACK_ERROR_MESSAGE };
}

type RequestOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

export async function requestTranslatorSpeech(
  text: string,
  language: TranslationLanguage,
  speed: number,
  options: RequestOptions = {},
) {
  const requestStartedAt = performance.now();
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/translator/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language, speed }),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new TranslatorSpeechClientError();
  }

  if (!response.ok) {
    throw new TranslatorSpeechClientError();
  }

  let audio: Blob;
  try {
    audio = await response.blob();
  } catch {
    throw new TranslatorSpeechClientError();
  }
  if (audio.size === 0) {
    throw new TranslatorSpeechClientError();
  }
  const generationHeader = Number(
    response.headers.get("X-Translator-Speech-Generation-Ms"),
  );
  return {
    audio,
    diagnostics: {
      ttsModel:
        response.headers.get("X-Translator-Speech-Model")?.trim() || "unknown",
      ttsGenerationMs:
        Number.isFinite(generationHeader) && generationHeader >= 0
          ? generationHeader
          : Math.max(0, Math.round(performance.now() - requestStartedAt)),
    },
  } satisfies TranslatorSpeechAsset;
}

export function isSpeechAbortError(error: unknown) {
  return getSpeechErrorName(error) === "AbortError";
}
