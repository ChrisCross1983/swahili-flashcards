import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import {
  getSupportedAudioFormat,
  MAX_TRANSLATION_AUDIO_BYTES,
} from "@/lib/translator/audioFormats";
import type {
  TranslationDirection,
  TranslationLanguage,
  TranslatorApiErrorCode,
} from "@/lib/translator/types";
import { getTranslatorPipelineErrorCode } from "@/lib/translator/server/errors";
import { createOpenAITranslatorGateway } from "@/lib/translator/server/openai";
import { translateRecordedAudio } from "@/lib/translator/server/translate";

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

function isAllowedDirection(direction: TranslationDirection) {
  return (
    (direction.sourceLanguage === "de" && direction.targetLanguage === "sw") ||
    (direction.sourceLanguage === "sw" && direction.targetLanguage === "de")
  );
}

export async function POST(request: Request) {
  const { response } = await requireUser();
  if (response) return response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "invalid_request", "Ungültige Anfrage.");
  }

  const audio = formData.get("audio");
  const sourceLanguage = parseLanguage(formData.get("sourceLanguage"));
  const targetLanguage = parseLanguage(formData.get("targetLanguage"));

  if (!(audio instanceof Blob) || audio.size === 0) {
    return errorResponse(400, "invalid_request", "Audioaufnahme fehlt.");
  }
  if (!sourceLanguage || !targetLanguage) {
    return errorResponse(400, "invalid_direction", "Ungültige Übersetzungsrichtung.");
  }

  const direction = { sourceLanguage, targetLanguage };
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

  try {
    const gateway = createOpenAITranslatorGateway();
    const result = await translateRecordedAudio(
      { audio, format, direction },
      gateway,
    );
    return NextResponse.json(result);
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
