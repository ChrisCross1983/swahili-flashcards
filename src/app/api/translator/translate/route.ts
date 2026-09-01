import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import {
  getSupportedAudioFormat,
  MAX_TRANSLATION_AUDIO_BYTES,
} from "@/lib/translator/audioFormats";
import type {
  TranslationLanguage,
  TranslationRequestDirection,
  TranslationResult,
  TranslatorApiErrorCode,
} from "@/lib/translator/types";
import { getTranslatorPipelineErrorCode } from "@/lib/translator/server/errors";
import { createOpenAITranslatorGateway } from "@/lib/translator/server/openai";
import {
  translateAuthoritativeText,
  translateRecordedAudio,
} from "@/lib/translator/server/translate";
import { LIVE_V2_CONFIG } from "@/lib/translator/live/v2/config";
import {
  serverTimingHeader,
  TRANSLATION_TIMING_HEADER,
  TRANSLATOR_CORRELATION_HEADER,
  validCorrelationId,
} from "@/lib/translator/performanceHeaders";

export const runtime = "nodejs";

function errorResponse(
  status: number,
  code: TranslatorApiErrorCode,
  error: string,
) {
  return NextResponse.json({ error, code }, { status });
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
  requestReceivedAt: string,
  requestReceivedMono: number,
  parsingDoneAt: string,
  correlationId: string | null,
  operation: (
    gateway: ReturnType<typeof createOpenAITranslatorGateway>,
  ) => Promise<TranslationResult>,
) {
  let openAiStartedAt: string | null = null;
  let openAiStartedMono: number | null = null;
  let openAiCompletedAt: string | null = null;
  let openAiCompletedMono: number | null = null;
  try {
    const gateway = createOpenAITranslatorGateway(undefined, {
      signal: request.signal,
      onTranslationRequestStarted: () => {
        openAiStartedMono = performance.now();
        openAiStartedAt = new Date().toISOString();
      },
      onTranslationCompleted: () => {
        openAiCompletedMono = performance.now();
        openAiCompletedAt = new Date().toISOString();
      },
    });
    const result = await operation(gateway);
    const preOpenAiMs = openAiStartedMono === null
      ? null
      : openAiStartedMono - requestReceivedMono;
    const openAiTotalMs =
      openAiStartedMono === null || openAiCompletedMono === null
        ? null
        : openAiCompletedMono - openAiStartedMono;
    const serializationStartedMono = performance.now();
    const responseBody = JSON.stringify({
      ...result,
      diagnostics: {
        ...result.diagnostics,
        ...(correlationId
          ? { translationRequestCorrelationId: correlationId }
          : {}),
        translationServerRequestReceivedAt: requestReceivedAt,
        translationServerParsingDoneAt: parsingDoneAt,
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
      total: serializationDoneMono - requestReceivedMono,
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
    console.error("[translator] request failed", { code });

    if (code === "no_speech") {
      return errorResponse(
        422,
        "no_speech",
        "Es wurde keine Sprache erkannt. Bitte versuche es erneut.",
      );
    }
    if (code === "unsupported_language") {
      return errorResponse(
        422,
        "unsupported_language",
        "Es wurde weder Deutsch noch Kiswahili erkannt. Bitte wähle die Sprache manuell.",
      );
    }
    if (code === "transcription_failed") {
      return errorResponse(
        502,
        "transcription_failed",
        "Die Aufnahme konnte nicht verarbeitet werden.",
      );
    }
    if (code === "configuration") {
      return errorResponse(
        503,
        "service_unavailable",
        "Der Übersetzungsdienst ist nicht verfügbar.",
      );
    }
    return errorResponse(
      502,
      "translation_failed",
      "Die Übersetzung konnte nicht erstellt werden.",
    );
  }
}

export async function POST(request: Request) {
  const requestReceivedMono = performance.now();
  const requestReceivedAt = new Date().toISOString();
  const correlationId = validCorrelationId(
    request.headers.get(TRANSLATOR_CORRELATION_HEADER),
  );
  const { response } = await requireUser();
  if (response) return response;

  if (request.headers.get("content-type")?.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "invalid_request", "Ungültige Anfrage.");
    }
    if (!body || typeof body !== "object") {
      return errorResponse(400, "invalid_request", "Ungültige Anfrage.");
    }
    const values = body as Record<string, unknown>;
    const direction = directionFromValues(
      values.sourceLanguage,
      values.targetLanguage,
    );
    const authoritativeTranscript =
      typeof values.authoritativeTranscript === "string"
        ? values.authoritativeTranscript.trim()
        : "";
    const transcriptionMs = values.transcriptionMs;
    if (!direction) {
      return errorResponse(400, "invalid_direction", "Ungültige Übersetzungsrichtung.");
    }
    if (
      !authoritativeTranscript ||
      authoritativeTranscript.length > 10_000 ||
      typeof transcriptionMs !== "number" ||
      !Number.isFinite(transcriptionMs) ||
      transcriptionMs < 0 ||
      transcriptionMs > 3_600_000
    ) {
      return errorResponse(400, "invalid_request", "Ungültiges Transkript.");
    }

    const parsingDoneAt = new Date().toISOString();
    return translationResponse(
      request,
      requestReceivedAt,
      requestReceivedMono,
      parsingDoneAt,
      correlationId,
      (gateway) => {
      return translateAuthoritativeText(
        {
          authoritativeTranscript,
          direction,
          transcriptionModel: LIVE_V2_CONFIG.transcriptionModel,
          transcriptionMs: Math.round(transcriptionMs),
        },
        gateway,
      );
      },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "invalid_request", "Ungültige Anfrage.");
  }

  const audio = formData.get("audio");
  const sourceValue = formData.get("sourceLanguage");
  const targetValue = formData.get("targetLanguage");
  const autoDirection = sourceValue === "auto" && targetValue === "auto";
  const sourceLanguage = parseLanguage(sourceValue);
  const targetLanguage = parseLanguage(targetValue);

  if (!(audio instanceof Blob) || audio.size === 0) {
    return errorResponse(400, "invalid_request", "Audioaufnahme fehlt.");
  }
  if (!autoDirection && (!sourceLanguage || !targetLanguage)) {
    return errorResponse(400, "invalid_direction", "Ungültige Übersetzungsrichtung.");
  }

  const direction: TranslationRequestDirection = autoDirection
    ? { sourceLanguage: "auto", targetLanguage: "auto" }
    : {
        sourceLanguage: sourceLanguage as TranslationLanguage,
        targetLanguage: targetLanguage as TranslationLanguage,
      };
  if (!isAllowedDirection(direction)) {
    return errorResponse(400, "invalid_direction", "Ungültige Übersetzungsrichtung.");
  }
  if (audio.size > MAX_TRANSLATION_AUDIO_BYTES) {
    return errorResponse(413, "audio_too_large", "Die Audioaufnahme ist zu groß.");
  }

  const format = getSupportedAudioFormat(audio.type);
  if (!format) {
    return errorResponse(
      400,
      "invalid_audio_format",
      "Dieses Audioformat wird nicht unterstützt.",
    );
  }

  const parsingDoneAt = new Date().toISOString();
  return translationResponse(
    request,
    requestReceivedAt,
    requestReceivedMono,
    parsingDoneAt,
    correlationId,
    (gateway) => {
    return translateRecordedAudio(
      { audio, format, direction },
      gateway,
    );
    },
  );
}
