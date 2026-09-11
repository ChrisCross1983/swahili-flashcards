import {
  getSupportedAudioFormat,
  MAX_TRANSLATION_AUDIO_BYTES,
} from "@/lib/translator/audioFormats";
import type {
  TranslationDiagnostics,
  TranslationEntry,
  TranslationRequestDirection,
  TranslationResult,
  TranslatorApiErrorCode,
} from "@/lib/translator/types";
import {
  createCorrelationId,
  parseTimingHeader,
  TRANSLATION_TIMING_HEADER,
  TRANSLATOR_CORRELATION_HEADER,
} from "@/lib/translator/performanceHeaders";
import {
  applyAuthFailureType,
  failureFromHttp,
  networkFailure,
  TranslatorOperationError,
  type TranslatorFailure,
} from "@/lib/translator/reliability";
import {
  isUsableRecordedAudio,
  type RecordedAudioDiagnostics,
} from "@/lib/translator/recordedAudio";

const NETWORK_ERROR =
  "Die Übersetzung konnte nicht geladen werden. Bitte versuche es erneut.";

function translationProtocolFailure(): TranslatorFailure {
  return {
    category: "TRANSLATION",
    message: "Die Übersetzung konnte gerade nicht erstellt werden. Bitte versuche es erneut.",
    healthStatus: "healthy",
    httpStatus: null,
    apiErrorCode: "invalid_translation_response",
    retryable: false,
    retryAfterMs: null,
    authFailureType: null,
  };
}

const API_ERROR_MESSAGES: Record<TranslatorApiErrorCode, string> = {
  invalid_request: "Die Aufnahme konnte nicht verarbeitet werden.",
  invalid_direction: "Die gewählte Übersetzungsrichtung ist ungültig.",
  invalid_audio_format: "Dieses Audioformat wird nicht unterstützt.",
  audio_too_large: "Die Aufnahme ist zu groß. Bitte nimm einen kürzeren Abschnitt auf.",
  invalid_audio_capture: "Es wurde keine Sprache aufgenommen. Bitte versuche es noch einmal.",
  no_audio_captured: "Es wurde keine Sprache aufgenommen. Bitte versuche es noch einmal.",
  no_speech: "Es wurde keine Sprache erkannt. Bitte versuche es erneut.",
  unsupported_language:
    "Ich konnte die Sprache nicht sicher erkennen. Bitte sprich den Satz noch einmal.",
  transcription_failed: "Die Aufnahme konnte nicht verarbeitet werden.",
  translation_failed: "Die Übersetzung konnte nicht erstellt werden.",
  service_unavailable: "Die Übersetzung konnte nicht erstellt werden.",
};

export class TranslatorClientError extends TranslatorOperationError {
  readonly recognizedTranscript: string | null;

  constructor(
    failure: ConstructorParameters<typeof TranslatorOperationError>[0],
    recognizedTranscript: string | null = null,
  ) {
    super(failure);
    this.name = "TranslatorClientError";
    this.recognizedTranscript = recognizedTranscript;
  }
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(5_000, Math.round(seconds * 1_000));
  }
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.min(5_000, Math.max(0, date - Date.now()))
    : null;
}

type RequestOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  correlationId?: string;
  onResponseCompleted?: (now: number) => void;
  requestAttempt?: number;
  requestPhase?: "primary" | "semantic_rescue";
  recordedAudioDiagnostics?: RecordedAudioDiagnostics;
};

export type AudioTranscriptionBenchmarkResult = {
  transcript: string;
  model: string;
  fallbackUsed: boolean;
  transcriptionMs: number;
  completedAt: string;
};

export type AudioTranscriptionBenchmarkOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  correlationId?: string;
  recordedAudioDiagnostics?: RecordedAudioDiagnostics;
  requestAttempt?: number;
};

function isNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOptionalTimestamp(value: unknown) {
  return (
    value === undefined ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)))
  );
}

function isTranslationDiagnostics(
  value: unknown,
): value is TranslationDiagnostics {
  if (!value || typeof value !== "object") return false;
  const diagnostics = value as Partial<TranslationDiagnostics>;
  return (
    typeof diagnostics.transcriptionModel === "string" &&
    Boolean(diagnostics.transcriptionModel) &&
    typeof diagnostics.translationModel === "string" &&
    Boolean(diagnostics.translationModel) &&
    isNonNegativeNumber(diagnostics.transcriptionMs) &&
    (isNonNegativeNumber(diagnostics.serverTranslationTotalMs) ||
      isNonNegativeNumber(diagnostics.totalMs)) &&
    typeof diagnostics.transcriptionFallbackUsed === "boolean" &&
    (diagnostics.detectedLanguage === null ||
      diagnostics.detectedLanguage === "de" ||
      diagnostics.detectedLanguage === "sw") &&
    (diagnostics.translationMs === undefined ||
      isNonNegativeNumber(diagnostics.translationMs)) &&
    (diagnostics.autoTranslateMs === undefined ||
      isNonNegativeNumber(diagnostics.autoTranslateMs)) &&
    isOptionalTimestamp(diagnostics.transcriptFinalAt) &&
    isOptionalTimestamp(diagnostics.translationStartedAt) &&
    isOptionalTimestamp(diagnostics.translationReadyAt) &&
    (diagnostics.translationMs === undefined) !==
      (diagnostics.autoTranslateMs === undefined)
  );
}

function isTranslationResult(value: unknown): value is TranslationResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<TranslationResult>;
  return (
    typeof result.originalText === "string" &&
    Boolean(result.originalText.trim()) &&
    typeof result.translatedText === "string" &&
    Boolean(result.translatedText.trim()) &&
    (result.essenceSummary === undefined ||
      result.essenceSummary === null ||
      (typeof result.essenceSummary === "string" &&
        Boolean(result.essenceSummary.trim()))) &&
    (result.sourceLanguage === "de" || result.sourceLanguage === "sw") &&
    (result.targetLanguage === "de" || result.targetLanguage === "sw") &&
    isTranslationDiagnostics(result.diagnostics)
  );
}

function createSafeAudioFormData(
  audioBlob: Blob,
  direction: TranslationRequestDirection,
  format: NonNullable<ReturnType<typeof getSupportedAudioFormat>>,
  diagnostics: RecordedAudioDiagnostics | undefined,
) {
  const formData = new FormData();
  formData.append(
    "audio",
    new File([audioBlob], `recording.${format.extension}`, {
      type: audioBlob.type,
    }),
  );
  formData.append("sourceLanguage", direction.sourceLanguage);
  formData.append("targetLanguage", direction.targetLanguage);
  if (typeof diagnostics?.recordingDurationMs === "number") {
    formData.append("recordingDurationMs", String(diagnostics.recordingDurationMs));
  }
  if (typeof diagnostics?.chunkCount === "number") {
    formData.append("chunkCount", String(diagnostics.chunkCount));
  }
  if (typeof diagnostics?.totalChunkBytes === "number") {
    formData.append("totalChunkBytes", String(diagnostics.totalChunkBytes));
  }
  return formData;
}

async function readTranslationResponse(
  response: Response,
  direction: TranslationRequestDirection,
  requestStartedAt: string,
  correlationId: string,
  onResponseCompleted?: (now: number) => void,
) {
  let firstByteAt: string | null = null;
  let responseCompletedAt: string;
  let text: string;
  try {
    if (!response.body) {
      text = await response.text();
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let output = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!firstByteAt && chunk.value.byteLength > 0) {
          firstByteAt = new Date().toISOString();
        }
        output += decoder.decode(chunk.value, { stream: true });
      }
      output += decoder.decode();
      text = output;
    }
    responseCompletedAt = new Date().toISOString();
    onResponseCompleted?.(performance.now());
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "AbortError"
    ) {
      throw error;
    }
    throw new TranslatorClientError(networkFailure("translation"));
  }
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!response.ok) {
    const errorBody = body && typeof body === "object"
      ? body as Record<string, unknown>
      : null;
    const code =
      errorBody && typeof errorBody.code === "string"
        ? (errorBody.code as TranslatorApiErrorCode)
        : null;
    let failure = failureFromHttp({
      status: response.status,
      apiErrorCode: code,
      stage: "translation",
      retryAfterMs: retryAfterMs(response),
    });
    if (code === "invalid_audio_capture" || code === "no_audio_captured") {
      failure = {
        ...failure,
        category: "RECORDER",
        message: API_ERROR_MESSAGES[code],
        healthStatus: "healthy",
        retryable: false,
      };
    }
    const authFailureType = errorBody &&
      typeof errorBody.authFailureType === "string" &&
      [
        "missing_session",
        "invalid_session",
        "auth_network_error",
        "auth_upstream_error",
        "unknown_auth_error",
      ].includes(errorBody.authFailureType)
      ? errorBody.authFailureType as TranslatorFailure["authFailureType"]
      : null;
    const recognizedTranscript = errorBody &&
      typeof errorBody.recognizedTranscript === "string" &&
      errorBody.recognizedTranscript.trim() &&
      errorBody.recognizedTranscript.length <= 10_000
      ? errorBody.recognizedTranscript
      : null;
    throw new TranslatorClientError(applyAuthFailureType({
      ...failure,
      message:
        code &&
        Object.prototype.hasOwnProperty.call(API_ERROR_MESSAGES, code)
          ? API_ERROR_MESSAGES[code]
          : failure.message,
    }, authFailureType), recognizedTranscript);
  }

  if (!isTranslationResult(body)) {
    throw new TranslatorClientError(translationProtocolFailure());
  }
  const result: TranslationResult = {
    originalText: body.originalText,
    translatedText: body.translatedText,
    ...(body.essenceSummary ? { essenceSummary: body.essenceSummary } : {}),
    sourceLanguage: body.sourceLanguage,
    targetLanguage: body.targetLanguage,
    diagnostics: {
      ...body.diagnostics,
      ...parseTimingHeader<TranslationDiagnostics>(
        response.headers.get(TRANSLATION_TIMING_HEADER),
      ),
      translationClientRequestStartedAt: requestStartedAt,
      ...(firstByteAt
        ? { translationClientResponseFirstByteAt: firstByteAt }
        : {}),
      translationClientResponseCompletedAt: responseCompletedAt,
      translationRequestCorrelationId:
        response.headers.get(TRANSLATOR_CORRELATION_HEADER)?.trim() ||
        correlationId,
    },
  };
  if (
    (direction.sourceLanguage === "auto" &&
      result.diagnostics.autoTranslateMs === undefined) ||
    (direction.sourceLanguage !== "auto" &&
      result.diagnostics.translationMs === undefined)
  ) {
    throw new TranslatorClientError(translationProtocolFailure());
  }
  if (
    direction.sourceLanguage !== "auto" &&
    (result.sourceLanguage !== direction.sourceLanguage ||
      result.targetLanguage !== direction.targetLanguage)
  ) {
    throw new TranslatorClientError(translationProtocolFailure());
  }
  if (result.sourceLanguage === result.targetLanguage) {
    throw new TranslatorClientError(translationProtocolFailure());
  }

  return result;
}

export async function requestAudioTranslation(
  audioBlob: Blob,
  direction: TranslationRequestDirection,
  options: RequestOptions = {},
): Promise<TranslationResult> {
  const requestStartedAt = new Date().toISOString();
  const correlationId = options.correlationId ?? createCorrelationId("translation");
  const validation = isUsableRecordedAudio(
    audioBlob,
    options.recordedAudioDiagnostics,
  );
  if (!validation.usable) {
    throw new TranslatorClientError({
      category: "RECORDER",
      message: API_ERROR_MESSAGES[validation.code],
      healthStatus: "healthy",
      httpStatus: 422,
      apiErrorCode: validation.code,
      retryable: false,
      retryAfterMs: null,
      authFailureType: null,
    });
  }
  if (audioBlob.size > MAX_TRANSLATION_AUDIO_BYTES) {
    throw new TranslatorClientError({
      ...failureFromHttp({
        status: 413,
        apiErrorCode: "audio_too_large",
        stage: "translation",
      }),
      message: API_ERROR_MESSAGES.audio_too_large,
    });
  }

  const format = getSupportedAudioFormat(audioBlob.type);
  if (!format) {
    throw new TranslatorClientError({
      ...failureFromHttp({
        status: 400,
        apiErrorCode: "invalid_audio_format",
        stage: "translation",
      }),
      message: API_ERROR_MESSAGES.invalid_audio_format,
    });
  }

  const formData = createSafeAudioFormData(
    audioBlob,
    direction,
    format,
    options.recordedAudioDiagnostics,
  );

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/translator/translate", {
      method: "POST",
      headers: {
        [TRANSLATOR_CORRELATION_HEADER]: correlationId,
        "X-Translator-Request-Attempt": String(options.requestAttempt ?? 0),
        "X-Translator-Request-Phase": options.requestPhase ?? "primary",
      },
      body: formData,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new TranslatorClientError(networkFailure("translation"));
  }

  return readTranslationResponse(
    response,
    direction,
    requestStartedAt,
    correlationId,
    options.onResponseCompleted,
  );
}

export async function requestAudioTranscriptionBenchmark(
  audioBlob: Blob,
  direction: TranslationRequestDirection,
  options: AudioTranscriptionBenchmarkOptions = {},
): Promise<AudioTranscriptionBenchmarkResult> {
  const correlationId = options.correlationId ?? createCorrelationId("translation");
  const validation = isUsableRecordedAudio(audioBlob, options.recordedAudioDiagnostics);
  if (!validation.usable) throw new Error(validation.code);
  if (audioBlob.size > MAX_TRANSLATION_AUDIO_BYTES) throw new Error("audio_too_large");
  const format = getSupportedAudioFormat(audioBlob.type);
  if (!format) throw new Error("invalid_audio_format");
  const formData = createSafeAudioFormData(
    audioBlob,
    direction,
    format,
    options.recordedAudioDiagnostics,
  );
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/translator/transcribe", {
      method: "POST",
      headers: {
        "X-Translator-Request-Phase": "internal_benchmark",
        "X-Translator-Request-Attempt": String(options.requestAttempt ?? 0),
        [TRANSLATOR_CORRELATION_HEADER]: correlationId,
      },
      body: formData,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new TranslatorClientError(networkFailure("translation"));
  }
  const body = await response.json().catch(() => null) as Partial<AudioTranscriptionBenchmarkResult> | null;
  if (!response.ok) {
    const errorBody = body as { code?: unknown } | null;
    const code = typeof errorBody?.code === "string"
      ? errorBody.code as TranslatorApiErrorCode
      : null;
    throw new TranslatorClientError(failureFromHttp({
      status: response.status,
      apiErrorCode: code,
      stage: "translation",
      retryAfterMs: retryAfterMs(response),
    }));
  }
  if (!body || typeof body.transcript !== "string" ||
    typeof body.model !== "string" || typeof body.fallbackUsed !== "boolean" ||
    typeof body.transcriptionMs !== "number" || typeof body.completedAt !== "string") {
    throw new TranslatorClientError(translationProtocolFailure());
  }
  return body as AudioTranscriptionBenchmarkResult;
}

export async function requestTextTranslation(
  authoritativeTranscript: string,
  direction: TranslationRequestDirection,
  transcriptionMs: number,
  options: RequestOptions = {},
): Promise<TranslationResult> {
  const requestStartedAt = new Date().toISOString();
  const correlationId = options.correlationId ?? createCorrelationId("translation");
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/translator/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [TRANSLATOR_CORRELATION_HEADER]: correlationId,
        "X-Translator-Request-Attempt": String(options.requestAttempt ?? 0),
        "X-Translator-Request-Phase": options.requestPhase ?? "primary",
      },
      body: JSON.stringify({
        authoritativeTranscript,
        sourceLanguage: direction.sourceLanguage,
        targetLanguage: direction.targetLanguage,
        transcriptionMs,
        ...(typeof options.recordedAudioDiagnostics?.recordingDurationMs === "number"
          ? {
              recordingDurationMs:
                options.recordedAudioDiagnostics.recordingDurationMs,
            }
          : {}),
      }),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new TranslatorClientError(networkFailure("translation"));
  }

  return readTranslationResponse(
    response,
    direction,
    requestStartedAt,
    correlationId,
    options.onResponseCompleted,
  );
}

export function createTranslationEntry(
  result: TranslationResult,
  options: {
    sourceWasDetected?: boolean;
    timestamp?: number;
    id?: string;
    diagnostics?: Partial<TranslationDiagnostics>;
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
    diagnostics: {
      ...result.diagnostics,
      ...options.diagnostics,
    },
  };
}

export function getTranslatorClientErrorMessage(error: unknown) {
  return error instanceof TranslatorOperationError ? error.message : NETWORK_ERROR;
}
