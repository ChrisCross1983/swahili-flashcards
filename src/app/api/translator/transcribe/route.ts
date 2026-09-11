import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import {
  getSupportedAudioFormat,
  MAX_TRANSLATION_AUDIO_BYTES,
} from "@/lib/translator/audioFormats";
import type { TranslationLanguage, TranslationRequestDirection } from "@/lib/translator/types";
import { createOpenAITranslatorGateway } from "@/lib/translator/server/openai";
import { getTranslatorPipelineErrorCode } from "@/lib/translator/server/errors";
import { transcribeRecordedAudio } from "@/lib/translator/server/translate";
import { isUsableRecordedAudio } from "@/lib/translator/recordedAudio";
import { INTERNAL_TRANSLATOR_QA_ENABLED } from "@/lib/translator/capturePolicy";

export const runtime = "nodejs";

function language(value: FormDataEntryValue | null) {
  return value === "de" || value === "sw" ? value : null;
}

export async function POST(request: Request) {
  if (!INTERNAL_TRANSLATOR_QA_ENABLED) {
    return NextResponse.json({ error: "Nicht verfügbar." }, { status: 404 });
  }
  const { response } = await requireUser();
  if (response) return response;
  if (request.headers.get("X-Translator-Request-Phase") !== "internal_benchmark") {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const audio = formData.get("audio");
  const sourceValue = formData.get("sourceLanguage");
  const sourceLanguage = sourceValue === "auto" ? null : language(sourceValue);
  const targetValue = formData.get("targetLanguage");
  const targetLanguage = targetValue === "auto" ? null : language(targetValue);
  const direction: TranslationRequestDirection | null = sourceValue === "auto" && targetValue === "auto"
    ? { sourceLanguage: "auto", targetLanguage: "auto" }
    : sourceLanguage && targetLanguage && sourceLanguage !== targetLanguage
      ? { sourceLanguage: sourceLanguage as TranslationLanguage, targetLanguage: targetLanguage as TranslationLanguage }
      : null;
  if (!(audio instanceof Blob) || !direction) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const recordingDurationMs = Number(formData.get("recordingDurationMs"));
  const chunkCount = Number(formData.get("chunkCount"));
  const totalChunkBytes = Number(formData.get("totalChunkBytes"));
  const validation = isUsableRecordedAudio(audio, {
    recordingDurationMs: Number.isFinite(recordingDurationMs) ? recordingDurationMs : null,
    chunkCount: Number.isFinite(chunkCount) ? chunkCount : null,
    totalChunkBytes: Number.isFinite(totalChunkBytes) ? totalChunkBytes : null,
  });
  if (!validation.usable) {
    return NextResponse.json({ code: validation.code, error: "Audioaufnahme ist nicht verwendbar." }, { status: 422 });
  }
  if (audio.size > MAX_TRANSLATION_AUDIO_BYTES) {
    return NextResponse.json({ code: "audio_too_large", error: "Die Audioaufnahme ist zu groß." }, { status: 413 });
  }
  const format = getSupportedAudioFormat(audio.type);
  if (!format) {
    return NextResponse.json({ code: "invalid_audio_format", error: "Dieses Audioformat wird nicht unterstützt." }, { status: 400 });
  }
  try {
    const result = await transcribeRecordedAudio(
      { audio, format, direction },
      createOpenAITranslatorGateway(),
    );
    return NextResponse.json(result);
  } catch (error) {
    const code = getTranslatorPipelineErrorCode(error);
    return NextResponse.json(
      { code: code === "no_speech" ? "no_speech" : "transcription_failed", error: "Vergleich konnte nicht erstellt werden." },
      { status: code === "no_speech" ? 422 : 503 },
    );
  }
}
