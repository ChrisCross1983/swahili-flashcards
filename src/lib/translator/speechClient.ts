import type { TranslationLanguage } from "@/lib/translator/types";

const SPEECH_ERROR_MESSAGE = "Die Sprachausgabe konnte nicht erstellt werden.";

export class TranslatorSpeechClientError extends Error {
  constructor(message = SPEECH_ERROR_MESSAGE) {
    super(message);
    this.name = "TranslatorSpeechClientError";
  }
}

type RequestOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

export async function requestTranslatorSpeech(
  text: string,
  language: TranslationLanguage,
  options: RequestOptions = {},
) {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/translator/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new TranslatorSpeechClientError();
  }

  if (!response.ok) {
    throw new TranslatorSpeechClientError();
  }

  const audio = await response.blob();
  if (audio.size === 0) {
    throw new TranslatorSpeechClientError();
  }
  return audio;
}

export function isSpeechAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
