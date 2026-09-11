import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import {
  getSupportedAudioFormat,
  MAX_TRANSLATION_AUDIO_BYTES,
  normalizeAudioMimeType,
} from "@/lib/translator/audioFormats";
import type {
  TranslationLanguage,
  TranslationRequestDirection,
  TranslationResult,
  TranslatorApiErrorCode,
} from "@/lib/translator/types";
import {
  getTranslatorPipelineErrorCode,
  TranslatorPipelineError,
} from "@/lib/translator/server/errors";
import { createOpenAITranslatorGateway } from "@/lib/translator/server/openai";
import {
  translateAuthoritativeText,
  translateRecordedAudio,
} from "@/lib/translator/server/translate";
import {
  otherPreOpenAiTiming,
  roundedServerTiming,
  ServerStageTimings,
} from "@/lib/translator/server/preOpenAiTimings";
import { LIVE_V2_CONFIG } from "@/lib/translator/live/v2/config";
import {
  serverTimingHeader,
  TRANSLATION_TIMING_HEADER,
  TRANSLATOR_CORRELATION_HEADER,
  validCorrelationId,
} from "@/lib/translator/performanceHeaders";
import { isUsableRecordedAudio } from "@/lib/translator/recordedAudio";

export const runtime = "nodejs";

type TranslationPreOpenAiStage =
  | "auth"
  | "authClientPreparation"
  | "authUserLookup"
  | "bodyRead"
  | "jsonParse"
  | "validation"
  | "normalization"
  | "openAiClientPreparation"
  | "promptPreparation"
  | "schemaPreparation";

type TranslationTimingContext = {
  routeReceivedAt: string;
  routeReceivedMono: number;
  stages: ServerStageTimings<TranslationPreOpenAiStage>;
};

function errorResponse(
  status: number,
  code: TranslatorApiErrorCode,
  error: string,
  recognizedTranscript: string | null = null,
  correlationId: string | null = null,
) {
  const response = NextResponse.json({
    error,
    code,
    ...(recognizedTranscript ? { recognizedTranscript } : {}),
  }, { status });
  if (correlationId) response.headers.set(TRANSLATOR_CORRELATION_HEADER, correlationId);
  return response;
}

function finiteFormNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseLanguage(value: FormDataEntryValue | null): TranslationLanguage | null {
  return value === "de" || value === "sw" ? value : null;
}

function isAllowedDirection(direction: TranslationRequestDirection) {
  return (
    (direction.sourceLanguage === "auto" && direction.targetLanguage === "auto") ||
    (direction.sourceLanguage === "de" && direction.targetLanguage === "sw") ||
    (direction.sourceLanguage === "sw" && direction.targetLanguage === "de")
  );
}

function directionFromValues(
  sourceValue: unknown,
  targetValue: unknown,
): TranslationRequestDirection | null {
  if (sourceValue === "auto" && targetValue === "auto") {
    return { sourceLanguage: "auto", targetLanguage: "auto" };
  }
  const sourceLanguage =
    sourceValue === "de" || sourceValue === "sw" ? sourceValue : null;
  const targetLanguage =
    targetValue === "de" || targetValue === "sw" ? targetValue : null;
  if (!sourceLanguage || !targetLanguage) return null;
  const direction: TranslationRequestDirection = {
    sourceLanguage,
    targetLanguage,
  };
  return isAllowedDirection(direction) ? direction : null;
}

async function translationResponse(
  request: Request,
  timingContext: TranslationTimingContext,
  parsingDoneAt: string,
  correlationId: string | null,
  operation: (
    gateway: ReturnType<typeof createOpenAITranslatorGateway>,
  ) => Promise<TranslationResult>,
  requestMetadata: {
    audioBytes: number | null;
    normalizedMimeType: string | null;
    retryAttempt: number;
    requestPhase: "primary" | "semantic_rescue";
  },
) {
  let openAiStartedAt: string | null = null;
  let openAiStartedMono: number | null = null;
  let openAiCompletedAt: string | null = null;
  let openAiCompletedMono: number | null = null;
  try {
    const serviceEnteredAt = new Date().toISOString();
    timingContext.stages.start("openAiClientPreparation");
    const gateway = createOpenAITranslatorGateway(undefined, {
      signal: request.signal,
      onPromptPreparationStarted: () => {
        timingContext.stages.start("promptPreparation");
      },
      onPromptPreparationCompleted: () => {
        timingContext.stages.complete("promptPreparation");
      },
      onSchemaPreparationStarted: () => {
        timingContext.stages.start("schemaPreparation");
      },
      onSchemaPreparationCompleted: () => {
        timingContext.stages.complete("schemaPreparation");
      },
      onTranslationRequestStarted: () => {
        openAiStartedMono = performance.now();
        openAiStartedAt = new Date().toISOString();
      },
      onTranslationCompleted: () => {
        openAiCompletedMono = performance.now();
        openAiCompletedAt = new Date().toISOString();
      },
    });
    const openAiClientReadyAt = timingContext.stages.complete(
      "openAiClientPreparation",
    );
    const result = await operation(gateway);
    const preOpenAiMs = openAiStartedMono === null
      ? null
      : openAiStartedMono - timingContext.routeReceivedMono;
    const openAiTotalMs =
      openAiStartedMono === null || openAiCompletedMono === null
        ? null
        : openAiCompletedMono - openAiStartedMono;
    const translationStageDurations = {
      translationAuthMs: timingContext.stages.duration("auth"),
      translationBodyReadMs: timingContext.stages.duration("bodyRead"),
      translationJsonParseMs: timingContext.stages.duration("jsonParse"),
      translationValidationMs: timingContext.stages.duration("validation"),
      translationNormalizationMs: timingContext.stages.duration("normalization"),
      translationPromptPreparationMs:
        timingContext.stages.duration("promptPreparation"),
      translationSchemaPreparationMs:
        timingContext.stages.duration("schemaPreparation"),
      translationOpenAiClientPreparationMs:
        timingContext.stages.duration("openAiClientPreparation"),
    };
    const translationOtherPreOpenAiMs = otherPreOpenAiTiming(
      preOpenAiMs,
      Object.values(translationStageDurations),
    );
    const preOpenAiDiagnostics = {
      translationRouteReceivedAt: timingContext.routeReceivedAt,
      translationAuthStartedAt: timingContext.stages.startedAt("auth"),
      translationAuthCompletedAt: timingContext.stages.completedAt("auth"),
      translationAuthClientPreparationStartedAt:
        timingContext.stages.startedAt("authClientPreparation"),
      translationAuthClientPreparationCompletedAt:
        timingContext.stages.completedAt("authClientPreparation"),
      translationAuthUserLookupStartedAt:
        timingContext.stages.startedAt("authUserLookup"),
      translationAuthUserLookupCompletedAt:
        timingContext.stages.completedAt("authUserLookup"),
      translationBodyReadStartedAt: timingContext.stages.startedAt("bodyRead"),
      translationBodyReadCompletedAt: timingContext.stages.completedAt("bodyRead"),
      translationJsonParseStartedAt: timingContext.stages.startedAt("jsonParse"),
      translationJsonParseCompletedAt: timingContext.stages.completedAt("jsonParse"),
      translationValidationStartedAt:
        timingContext.stages.startedAt("validation"),
      translationValidationCompletedAt:
        timingContext.stages.completedAt("validation"),
      translationInputNormalizationStartedAt:
        timingContext.stages.startedAt("normalization"),
      translationInputNormalizationCompletedAt:
        timingContext.stages.completedAt("normalization"),
      translationServiceEnteredAt: serviceEnteredAt,
      translationPromptPreparationStartedAt:
        timingContext.stages.startedAt("promptPreparation"),
      translationPromptPreparationCompletedAt:
        timingContext.stages.completedAt("promptPreparation"),
      translationSchemaPreparationStartedAt:
        timingContext.stages.startedAt("schemaPreparation"),
      translationSchemaPreparationCompletedAt:
        timingContext.stages.completedAt("schemaPreparation"),
      translationOpenAiClientReadyAt: openAiClientReadyAt,
      translationAuthMs: roundedServerTiming(
        translationStageDurations.translationAuthMs,
      ),
      translationAuthClientPreparationMs: roundedServerTiming(
        timingContext.stages.duration("authClientPreparation"),
      ),
      translationAuthUserLookupMs: roundedServerTiming(
        timingContext.stages.duration("authUserLookup"),
      ),
      translationBodyReadMs: roundedServerTiming(
        translationStageDurations.translationBodyReadMs,
      ),
      translationJsonParseMs: roundedServerTiming(
        translationStageDurations.translationJsonParseMs,
      ),
      translationValidationMs: roundedServerTiming(
        translationStageDurations.translationValidationMs,
      ),
      translationNormalizationMs: roundedServerTiming(
        translationStageDurations.translationNormalizationMs,
      ),
      translationPromptPreparationMs: roundedServerTiming(
        translationStageDurations.translationPromptPreparationMs,
      ),
      translationSchemaPreparationMs: roundedServerTiming(
        translationStageDurations.translationSchemaPreparationMs,
      ),
      translationOpenAiClientPreparationMs: roundedServerTiming(
        translationStageDurations.translationOpenAiClientPreparationMs,
      ),
      translationOtherPreOpenAiMs: roundedServerTiming(
        translationOtherPreOpenAiMs,
      ),
    };
    const serializationStartedMono = performance.now();
    const responseBody = JSON.stringify({
      ...result,
      diagnostics: {
        ...result.diagnostics,
        ...(correlationId
          ? { translationRequestCorrelationId: correlationId }
          : {}),
        translationServerRequestReceivedAt: timingContext.routeReceivedAt,
        translationServerParsingDoneAt: parsingDoneAt,
        ...preOpenAiDiagnostics,
        ...(openAiStartedAt
          ? { translationOpenAiRequestStartedAt: openAiStartedAt }
          : {}),
        ...(openAiCompletedAt
          ? { translationOpenAiCompletedAt: openAiCompletedAt }
          : {}),
        ...(preOpenAiMs === null
          ? {}
          : { translationServerPreOpenAiMs: Math.round(preOpenAiMs) }),
        ...(openAiTotalMs === null
          ? {}
          : { translationOpenAiTotalMs: Math.round(openAiTotalMs) }),
      },
    });
    const serializationDoneMono = performance.now();
    const serializationDoneAt = new Date().toISOString();
    const responseStartedAt = new Date().toISOString();
    const serverPostOpenAiMs = openAiCompletedMono === null
      ? null
      : serializationDoneMono - openAiCompletedMono;
    const timing = {
      translationServerSerializationDoneAt: serializationDoneAt,
      translationServerResponseStartedAt: responseStartedAt,
      ...(serverPostOpenAiMs === null
        ? {}
        : { translationServerPostOpenAiMs: Math.round(serverPostOpenAiMs) }),
    };
    const serverTiming = serverTimingHeader({
      "app-pre": preOpenAiMs,
      openai: openAiTotalMs,
      "app-post": serverPostOpenAiMs,
      total: serializationDoneMono - timingContext.routeReceivedMono,
      serialization: serializationDoneMono - serializationStartedMono,
    });
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...(correlationId
          ? { [TRANSLATOR_CORRELATION_HEADER]: correlationId }
          : {}),
        [TRANSLATION_TIMING_HEADER]: JSON.stringify(timing),
        ...(serverTiming ? { "Server-Timing": serverTiming } : {}),
      },
    });
  } catch (error) {
    const code = getTranslatorPipelineErrorCode(error) ?? "translation_failed";
    const recognizedTranscript = error instanceof TranslatorPipelineError
      ? error.recognizedTranscript
      : null;
    const httpStatus = code === "no_speech" || code === "unsupported_language"
      ? 422
      : code === "configuration" ? 503 : 502;
    console.error("[translator] request failed", {
      correlationId,
      apiCode: code,
      stage: code === "transcription_failed" ? "transcription" : "translation",
      httpStatus,
      audioBytes: requestMetadata.audioBytes,
      normalizedMimeType: requestMetadata.normalizedMimeType,
      transcriptionModel: requestMetadata.audioBytes === null
        ? null
        : "gpt-4o-mini-transcribe",
      upstreamHttpStatus: null,
      upstreamRequestId: null,
      retryAttempt: requestMetadata.retryAttempt,
      requestPhase: requestMetadata.requestPhase,
    });

    if (code === "no_speech") {
      return errorResponse(
        422,
        "no_speech",
        "Es wurde keine Sprache erkannt. Bitte versuche es erneut.",
        null,
        correlationId,
      );
    }
    if (code === "unsupported_language") {
      return errorResponse(
        422,
        "unsupported_language",
        "Ich konnte die Sprache nicht sicher erkennen. Bitte sprich den Satz noch einmal.",
        recognizedTranscript,
        correlationId,
      );
    }
    if (code === "transcription_failed") {
      return errorResponse(
        502,
        "transcription_failed",
        "Die Aufnahme konnte nicht verarbeitet werden.",
        null,
        correlationId,
      );
    }
    if (code === "configuration") {
      return errorResponse(
        503,
        "service_unavailable",
        "Der Übersetzungsdienst ist nicht verfügbar.",
        null,
        correlationId,
      );
    }
    return errorResponse(
      502,
      "translation_failed",
      "Die Übersetzung konnte nicht erstellt werden.",
      recognizedTranscript,
      correlationId,
    );
  }
}

export async function POST(request: Request) {
  const requestReceivedMono = performance.now();
  const requestReceivedAt = new Date().toISOString();
  const timingContext: TranslationTimingContext = {
    routeReceivedAt: requestReceivedAt,
    routeReceivedMono: requestReceivedMono,
    stages: new ServerStageTimings<TranslationPreOpenAiStage>(),
  };
  const correlationId = validCorrelationId(
    request.headers.get(TRANSLATOR_CORRELATION_HEADER),
  );
  const retryAttempt = Math.max(0, Math.min(1, Number.parseInt(
    request.headers.get("X-Translator-Request-Attempt") ?? "0",
    10,
  ) || 0));
  const requestPhase = request.headers.get("X-Translator-Request-Phase") ===
    "semantic_rescue" ? "semantic_rescue" as const : "primary" as const;
  timingContext.stages.start("auth");
  const { response } = await requireUser({
    onClientPreparationStarted: () => {
      timingContext.stages.start("authClientPreparation");
    },
    onClientPreparationCompleted: () => {
      timingContext.stages.complete("authClientPreparation");
    },
    onUserLookupStarted: () => {
      timingContext.stages.start("authUserLookup");
    },
    onUserLookupCompleted: () => {
      timingContext.stages.complete("authUserLookup");
    },
  });
  timingContext.stages.complete("auth");
  if (response) {
    if (!correlationId) return response;
    const headers = new Headers(response.headers);
    headers.set(TRANSLATOR_CORRELATION_HEADER, correlationId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  if (request.headers.get("content-type")?.includes("application/json")) {
    let bodyText: string;
    timingContext.stages.start("bodyRead");
    try {
      bodyText = await request.text();
    } catch {
      timingContext.stages.complete("bodyRead");
      return errorResponse(400, "invalid_request", "Ungültige Anfrage.", null, correlationId);
    }
    timingContext.stages.complete("bodyRead");
    let body: unknown;
    timingContext.stages.start("jsonParse");
    try {
      body = JSON.parse(bodyText);
    } catch {
      timingContext.stages.complete("jsonParse");
      return errorResponse(400, "invalid_request", "Ungültige Anfrage.", null, correlationId);
    }
    timingContext.stages.complete("jsonParse");
    timingContext.stages.start("normalization");
    const values = body && typeof body === "object"
      ? body as Record<string, unknown>
      : null;
    const authoritativeTranscript =
      typeof values?.authoritativeTranscript === "string"
        ? values.authoritativeTranscript.trim()
        : "";
    const transcriptionMs = values?.transcriptionMs;
    const recordingDurationMs = values?.recordingDurationMs;
    const normalizedTranscriptionMs = typeof transcriptionMs === "number"
      ? Math.round(transcriptionMs)
      : transcriptionMs;
    timingContext.stages.complete("normalization");
    timingContext.stages.start("validation");
    if (!body || typeof body !== "object") {
      timingContext.stages.complete("validation");
      return errorResponse(400, "invalid_request", "Ungültige Anfrage.", null, correlationId);
    }
    const direction = directionFromValues(
      values?.sourceLanguage,
      values?.targetLanguage,
    );
    if (!direction) {
      timingContext.stages.complete("validation");
      return errorResponse(400, "invalid_direction", "Ungültige Übersetzungsrichtung.", null, correlationId);
    }
    if (
      !authoritativeTranscript ||
      authoritativeTranscript.length > 10_000 ||
      typeof transcriptionMs !== "number" ||
      !Number.isFinite(transcriptionMs) ||
      transcriptionMs < 0 ||
      transcriptionMs > 3_600_000
    ) {
      timingContext.stages.complete("validation");
      return errorResponse(400, "invalid_request", "Ungültiges Transkript.", null, correlationId);
    }
    timingContext.stages.complete("validation");

    const parsingDoneAt = new Date().toISOString();
    return translationResponse(
      request,
      timingContext,
      parsingDoneAt,
      correlationId,
      (gateway) => {
      return translateAuthoritativeText(
        {
          authoritativeTranscript,
          direction,
          transcriptionModel: LIVE_V2_CONFIG.transcriptionModel,
          transcriptionMs: normalizedTranscriptionMs as number,
          recordingDurationMs:
            typeof recordingDurationMs === "number" &&
            Number.isFinite(recordingDurationMs) &&
            recordingDurationMs >= 0
              ? recordingDurationMs
              : null,
        },
        gateway,
      );
      },
      { audioBytes: null, normalizedMimeType: null, retryAttempt, requestPhase },
    );
  }

  let formData: FormData;
  timingContext.stages.start("bodyRead");
  try {
    formData = await request.formData();
  } catch {
    timingContext.stages.complete("bodyRead");
    return errorResponse(400, "invalid_request", "Ungültige Anfrage.", null, correlationId);
  }
  timingContext.stages.complete("bodyRead");

  timingContext.stages.start("normalization");
  const audio = formData.get("audio");
  const sourceValue = formData.get("sourceLanguage");
  const targetValue = formData.get("targetLanguage");
  const recordingDurationMs = finiteFormNumber(formData.get("recordingDurationMs"));
  const chunkCount = finiteFormNumber(formData.get("chunkCount"));
  const totalChunkBytes = finiteFormNumber(formData.get("totalChunkBytes"));
  const autoDirection = sourceValue === "auto" && targetValue === "auto";
  const sourceLanguage = parseLanguage(sourceValue);
  const targetLanguage = parseLanguage(targetValue);
  const direction: TranslationRequestDirection = autoDirection
    ? { sourceLanguage: "auto", targetLanguage: "auto" }
    : {
        sourceLanguage: sourceLanguage as TranslationLanguage,
        targetLanguage: targetLanguage as TranslationLanguage,
      };
  timingContext.stages.complete("normalization");
  timingContext.stages.start("validation");

  if (!(audio instanceof Blob)) {
    timingContext.stages.complete("validation");
    return errorResponse(400, "invalid_request", "Audioaufnahme fehlt.", null, correlationId);
  }
  const audioValidation = isUsableRecordedAudio(audio, {
    recordingDurationMs,
    chunkCount,
    totalChunkBytes,
  });
  if (!audioValidation.usable) {
    timingContext.stages.complete("validation");
    console.warn("[translator] invalid audio capture", {
      correlationId,
      apiCode: audioValidation.code,
      stage: "audio_validation",
      httpStatus: 422,
      audioBytes: audio.size,
      normalizedMimeType: audio.type ? normalizeAudioMimeType(audio.type) : null,
      transcriptionModel: "gpt-4o-mini-transcribe",
      retryAttempt,
      requestPhase,
    });
    return errorResponse(
      422,
      audioValidation.code,
      "Es wurde keine Sprache aufgenommen. Bitte versuche es noch einmal.",
      null,
      correlationId,
    );
  }
  if (!autoDirection && (!sourceLanguage || !targetLanguage)) {
    timingContext.stages.complete("validation");
    return errorResponse(400, "invalid_direction", "Ungültige Übersetzungsrichtung.", null, correlationId);
  }

  if (!isAllowedDirection(direction)) {
    timingContext.stages.complete("validation");
    return errorResponse(400, "invalid_direction", "Ungültige Übersetzungsrichtung.", null, correlationId);
  }
  if (audio.size > MAX_TRANSLATION_AUDIO_BYTES) {
    timingContext.stages.complete("validation");
    return errorResponse(413, "audio_too_large", "Die Audioaufnahme ist zu groß.", null, correlationId);
  }

  const format = getSupportedAudioFormat(audio.type);
  if (!format) {
    timingContext.stages.complete("validation");
    return errorResponse(
      400,
      "invalid_audio_format",
      "Dieses Audioformat wird nicht unterstützt.",
      null,
      correlationId,
    );
  }
  timingContext.stages.complete("validation");

  const parsingDoneAt = new Date().toISOString();
  return translationResponse(
    request,
    timingContext,
    parsingDoneAt,
    correlationId,
    (gateway) => {
    return translateRecordedAudio(
      { audio, format, direction, recordingDurationMs },
      gateway,
    );
    },
    {
      audioBytes: audio.size,
      normalizedMimeType: format.mimeType,
      retryAttempt,
      requestPhase,
    },
  );
}
