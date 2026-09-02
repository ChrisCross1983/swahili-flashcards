import type { TranslationLanguage } from "@/lib/translator/types";
import {
  createCorrelationId,
  parseTimingHeader,
  SPEECH_TIMING_HEADER,
  TRANSLATOR_CORRELATION_HEADER,
} from "@/lib/translator/performanceHeaders";

const SPEECH_ERROR_MESSAGE = "Die Sprachausgabe konnte nicht erstellt werden.";
const SPEECH_READY_MESSAGE =
  "Audio ist bereit. Tippe einmal auf „Abspielen“ – es wird nicht neu erzeugt.";
const SPEECH_PLAYBACK_ERROR_MESSAGE = "Die Wiedergabe ist gerade nicht möglich.";

export type TranslatorSpeechFailureKind =
  | "generation"
  | "autoplay-blocked"
  | "playback";

export type TranslatorSpeechGenerationDiagnostics = {
  ttsModel: string;
  ttsGenerationMs: number;
  ttsRequestMs?: number;
  ttsRequestCorrelationId?: string;
  ttsClientRequestStartedAt?: string;
  ttsRouteReceivedAt?: string | null;
  ttsAuthStartedAt?: string | null;
  ttsAuthCompletedAt?: string | null;
  ttsAuthClientPreparationStartedAt?: string | null;
  ttsAuthClientPreparationCompletedAt?: string | null;
  ttsAuthUserLookupStartedAt?: string | null;
  ttsAuthUserLookupCompletedAt?: string | null;
  ttsBodyReadStartedAt?: string | null;
  ttsBodyReadCompletedAt?: string | null;
  ttsJsonParseStartedAt?: string | null;
  ttsJsonParseCompletedAt?: string | null;
  ttsValidationStartedAt?: string | null;
  ttsValidationCompletedAt?: string | null;
  ttsInputNormalizationStartedAt?: string | null;
  ttsInputNormalizationCompletedAt?: string | null;
  ttsServiceEnteredAt?: string | null;
  ttsInstructionPreparationStartedAt?: string | null;
  ttsInstructionPreparationCompletedAt?: string | null;
  ttsOpenAiClientReadyAt?: string | null;
  ttsServerRequestReceivedAt?: string;
  ttsServerParsingDoneAt?: string;
  ttsOpenAiRequestStartedAt?: string;
  ttsOpenAiFirstByteAt?: string | null;
  ttsOpenAiCompletedAt?: string | null;
  ttsServerFirstByteSentAt?: string | null;
  ttsServerCompletedAt?: string | null;
  ttsClientFirstByteAt?: string;
  ttsClientResponseCompletedAt?: string;
  ttsServerPreOpenAiMs?: number;
  ttsAuthMs?: number | null;
  ttsAuthClientPreparationMs?: number | null;
  ttsAuthUserLookupMs?: number | null;
  ttsBodyReadMs?: number | null;
  ttsJsonParseMs?: number | null;
  ttsValidationMs?: number | null;
  ttsNormalizationMs?: number | null;
  ttsInstructionPreparationMs?: number | null;
  ttsOpenAiClientPreparationMs?: number | null;
  ttsOtherPreOpenAiMs?: number | null;
  ttsOpenAiTimeToFirstByteMs?: number | null;
  ttsOpenAiTotalMs?: number | null;
  ttsServerStreamingOverheadMs?: number | null;
  ttsClientDownloadTotalMs?: number;
  ttsStreamingUsed?: boolean;
  streamingFallbackReason?: string;
};

export type TranslatorSpeechAsset = {
  audio: Blob;
  diagnostics: TranslatorSpeechGenerationDiagnostics;
  serverDiagnostics?: Promise<Partial<TranslatorSpeechGenerationDiagnostics> | null>;
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
  correlationId?: string;
};

export async function requestTranslatorSpeech(
  text: string,
  language: TranslationLanguage,
  speed: number,
  options: RequestOptions = {},
) {
  const requestStartedAt = performance.now();
  const requestStartedIso = new Date().toISOString();
  const correlationId = options.correlationId ?? createCorrelationId("tts");
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/translator/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [TRANSLATOR_CORRELATION_HEADER]: correlationId,
      },
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

  const responseHeadersReceivedMono = performance.now();
  let audio: Blob;
  let firstByteAt: string | null = null;
  let streamingFallbackReason: string | undefined;
  try {
    if (!response.body) {
      streamingFallbackReason = "response_body_unavailable";
      audio = await response.blob();
    } else {
      const reader = response.body.getReader();
      const chunks: ArrayBuffer[] = [];
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!firstByteAt && chunk.value.byteLength > 0) {
          firstByteAt = new Date().toISOString();
        }
        chunks.push(chunk.value.slice().buffer as ArrayBuffer);
      }
      audio = new Blob(chunks, {
        type: response.headers.get("content-type") || "audio/mpeg",
      });
    }
  } catch (error) {
    if (getSpeechErrorName(error) === "AbortError") throw error;
    throw new TranslatorSpeechClientError();
  }
  if (audio.size === 0) {
    throw new TranslatorSpeechClientError();
  }
  const responseCompletedAt = new Date().toISOString();
  const responseCompletedMono = performance.now();
  const ttsRequestMs = Math.round(responseCompletedMono - requestStartedAt);
  const ttsClientDownloadTotalMs = Math.round(
    responseCompletedMono - responseHeadersReceivedMono,
  );
  const generationHeader = Number(
    response.headers.get("X-Translator-Speech-Generation-Ms"),
  );
  const responseCorrelationId =
    response.headers.get(TRANSLATOR_CORRELATION_HEADER)?.trim() || correlationId;
  const headerDiagnostics = parseTimingHeader<TranslatorSpeechGenerationDiagnostics>(
    response.headers.get(SPEECH_TIMING_HEADER),
  );
  const serverDiagnostics = fetcher(
    `/api/translator/speech?correlationId=${encodeURIComponent(responseCorrelationId)}`,
    { method: "GET", signal: options.signal },
  ).then(async (diagnosticResponse) => {
    if (!diagnosticResponse.ok) return null;
    const value = await diagnosticResponse.json().catch(() => null);
    return value && typeof value === "object"
      ? value as Partial<TranslatorSpeechGenerationDiagnostics>
      : null;
  }).catch(() => null);
  return {
    audio,
    diagnostics: {
      ttsModel:
        response.headers.get("X-Translator-Speech-Model")?.trim() || "unknown",
      ttsGenerationMs:
        Number.isFinite(generationHeader) && generationHeader >= 0
          ? generationHeader
          : ttsRequestMs,
      ttsRequestMs,
      ...headerDiagnostics,
      ttsRequestCorrelationId: responseCorrelationId,
      ttsClientRequestStartedAt: requestStartedIso,
      ...(firstByteAt ? { ttsClientFirstByteAt: firstByteAt } : {}),
      ttsClientResponseCompletedAt: responseCompletedAt,
      ttsClientDownloadTotalMs,
      ttsStreamingUsed: streamingFallbackReason === undefined,
      ...(streamingFallbackReason ? { streamingFallbackReason } : {}),
    },
    serverDiagnostics,
  } satisfies TranslatorSpeechAsset;
}

export function isSpeechAbortError(error: unknown) {
  return getSpeechErrorName(error) === "AbortError";
}
