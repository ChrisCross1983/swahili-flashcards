import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import type { TranslationLanguage } from "@/lib/translator/types";
import { getTranslatorPipelineErrorCode } from "@/lib/translator/server/errors";
import { createOpenAISpeechGateway } from "@/lib/translator/server/openai";
import {
  generateTranslatorSpeech,
  MAX_SPEECH_TEXT_LENGTH,
} from "@/lib/translator/server/speech";

export const runtime = "nodejs";

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status });
}

function parseLanguage(value: unknown): TranslationLanguage | null {
  return value === "de" || value === "sw" ? value : null;
}

export async function POST(request: Request) {
  const { response } = await requireUser();
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "Ungültige Anfrage.");
  }

  if (!body || typeof body !== "object") {
    return errorResponse(400, "invalid_request", "Ungültige Anfrage.");
  }

  const payload = body as Record<string, unknown>;
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const language = parseLanguage(payload.language);

  if (!text) {
    return errorResponse(400, "invalid_text", "Text für die Sprachausgabe fehlt.");
  }
  if (!language) {
    return errorResponse(400, "invalid_language", "Ungültige Sprache.");
  }
  if (text.length > MAX_SPEECH_TEXT_LENGTH) {
    return errorResponse(413, "text_too_long", "Der Text ist zu lang.");
  }

  try {
    const gateway = createOpenAISpeechGateway();
    const audio = await generateTranslatorSpeech(text, language, gateway);
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const code = getTranslatorPipelineErrorCode(error) ?? "speech_failed";
    console.error("[translator] speech request failed", { code });

    if (code === "configuration") {
      return errorResponse(
        503,
        "service_unavailable",
        "Die Sprachausgabe ist derzeit nicht verfügbar.",
      );
    }
    return errorResponse(
      502,
      "speech_failed",
      "Die Sprachausgabe konnte nicht erstellt werden.",
    );
  }
}
