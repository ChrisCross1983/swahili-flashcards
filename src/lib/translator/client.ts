import {
  getSupportedAudioFormat,
  MAX_TRANSLATION_AUDIO_BYTES,
} from "@/lib/translator/audioFormats";
import type {
  TranslationEntry,
  TranslationRequestDirection,
  TranslationResult,
  TranslatorApiErrorCode,
} from "@/lib/translator/types";

const NETWORK_ERROR =
  "Die Übersetzung konnte nicht geladen werden. Bitte versuche es erneut.";

const API_ERROR_MESSAGES: Record<TranslatorApiErrorCode, string> = {
  invalid_request: "Die Aufnahme konnte nicht verarbeitet werden.",
  invalid_direction: "Die gewählte Übersetzungsrichtung ist ungültig.",
  invalid_audio_format: "Dieses Audioformat wird nicht unterstützt.",
  audio_too_large: "Die Aufnahme ist zu groß. Bitte nimm einen kürzeren Abschnitt auf.",
  no_speech: "Es wurde keine Sprache erkannt. Bitte versuche es erneut.",
  unsupported_language:
    "Es wurde weder Deutsch noch Kiswahili erkannt. Bitte wähle die Sprache manuell.",
  transcription_failed: "Die Aufnahme konnte nicht verarbeitet werden.",
  translation_failed: "Die Übersetzung konnte nicht erstellt werden.",
  service_unavailable: "Die Übersetzung konnte nicht erstellt werden.",
};

export class TranslatorClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslatorClientError";
  }
}

type RequestOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

function isTranslationResult(value: unknown): value is TranslationResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<TranslationResult>;
  return (
    typeof result.originalText === "string" &&
    Boolean(result.originalText.trim()) &&
    typeof result.translatedText === "string" &&
    Boolean(result.translatedText.trim()) &&
    (result.sourceLanguage === "de" || result.sourceLanguage === "sw") &&
    (result.targetLanguage === "de" || result.targetLanguage === "sw")
  );
}

export async function requestAudioTranslation(
  audioBlob: Blob,
  direction: TranslationRequestDirection,
  options: RequestOptions = {},
): Promise<TranslationResult> {
  if (audioBlob.size > MAX_TRANSLATION_AUDIO_BYTES) {
    throw new TranslatorClientError(API_ERROR_MESSAGES.audio_too_large);
  }

  const format = getSupportedAudioFormat(audioBlob.type);
  if (!format) {
    throw new TranslatorClientError(API_ERROR_MESSAGES.invalid_audio_format);
  }

  const formData = new FormData();
  formData.append(
    "audio",
    new File([audioBlob], `recording.${format.extension}`, {
      type: audioBlob.type,
    }),
  );
  formData.append("sourceLanguage", direction.sourceLanguage);
  formData.append("targetLanguage", direction.targetLanguage);

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/translator/translate", {
      method: "POST",
      body: formData,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new TranslatorClientError(NETWORK_ERROR);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      body && typeof body.code === "string"
        ? (body.code as TranslatorApiErrorCode)
        : null;
    throw new TranslatorClientError(
      code && Object.prototype.hasOwnProperty.call(API_ERROR_MESSAGES, code)
        ? API_ERROR_MESSAGES[code]
        : NETWORK_ERROR,
    );
  }

  if (!isTranslationResult(body)) {
    throw new TranslatorClientError(NETWORK_ERROR);
  }
  if (
    direction.sourceLanguage !== "auto" &&
    (body.sourceLanguage !== direction.sourceLanguage ||
      body.targetLanguage !== direction.targetLanguage)
  ) {
    throw new TranslatorClientError(NETWORK_ERROR);
  }
  if (body.sourceLanguage === body.targetLanguage) {
    throw new TranslatorClientError(NETWORK_ERROR);
  }

  return body;
}

export function createTranslationEntry(
  result: TranslationResult,
  options: {
    sourceWasDetected?: boolean;
    timestamp?: number;
    id?: string;
  } = {},
): TranslationEntry {
  const timestamp = options.timestamp ?? Date.now();
  const id =
    options.id ??
    globalThis.crypto?.randomUUID?.() ??
    `translation-${timestamp}`;
  return {
    id,
    timestamp,
    sourceWasDetected: options.sourceWasDetected ?? false,
    ...result,
  };
}

export function getTranslatorClientErrorMessage(error: unknown) {
  return error instanceof TranslatorClientError ? error.message : NETWORK_ERROR;
}
