import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import type { TranslationLanguage } from "@/lib/translator/types";
import { getTranslatorPipelineErrorCode } from "@/lib/translator/server/errors";
import { createOpenAISpeechGateway } from "@/lib/translator/server/openai";
import {
  generateTranslatorSpeech,
  MAX_SPEECH_TEXT_LENGTH,
} from "@/lib/translator/server/speech";
import { isValidSpeechSpeed } from "@/lib/translator/speechSpeed";
import { SPEECH_MODEL } from "@/lib/translator/server/models";
import {
  serverTimingHeader,
  SPEECH_TIMING_HEADER,
  TRANSLATOR_CORRELATION_HEADER,
  validCorrelationId,
} from "@/lib/translator/performanceHeaders";
import {
  getSpeechServerDiagnostics,
  setSpeechServerDiagnostics,
  updateSpeechServerDiagnostics,
} from "@/lib/translator/server/speechDiagnostics";

export const runtime = "nodejs";

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status });
}

function parseLanguage(value: unknown): TranslationLanguage | null {
  return value === "de" || value === "sw" ? value : null;
}

export async function GET(request: Request) {
  const { response } = await requireUser();
  if (response) return response;
  const correlationId = validCorrelationId(
    new URL(request.url).searchParams.get("correlationId"),
  );
  if (!correlationId) return errorResponse(400, "invalid_request", "Ungültige Anfrage.");
  const diagnostics = getSpeechServerDiagnostics(correlationId);
  if (!diagnostics) return errorResponse(404, "not_found", "Diagnostik nicht verfügbar.");
  return NextResponse.json(diagnostics, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const requestReceivedMono = performance.now();
  const requestReceivedAt = new Date().toISOString();
  const correlationId = validCorrelationId(
    request.headers.get(TRANSLATOR_CORRELATION_HEADER),
  );
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
  const speed = payload.speed;

  if (!text) {
    return errorResponse(400, "invalid_text", "Text für die Sprachausgabe fehlt.");
  }
  if (!language) {
    return errorResponse(400, "invalid_language", "Ungültige Sprache.");
  }
  if (!isValidSpeechSpeed(speed)) {
    return errorResponse(400, "invalid_speed", "Ungültiges Sprechtempo.");
  }
  if (text.length > MAX_SPEECH_TEXT_LENGTH) {
    return errorResponse(413, "text_too_long", "Der Text ist zu lang.");
  }

  try {
    const parsingDoneAt = new Date().toISOString();
    const gateway = createOpenAISpeechGateway();
    const openAiStartedMono = performance.now();
    const openAiStartedAt = new Date().toISOString();
    const upstream = await generateTranslatorSpeech(
      text,
      language,
      speed,
      gateway,
      request.signal,
    );
    const upstreamHeadersAt = new Date().toISOString();
    const preOpenAiMs = openAiStartedMono - requestReceivedMono;
    const correlation = correlationId ?? `tts-server-${Date.now()}`;
    setSpeechServerDiagnostics(correlation, {
      ttsRequestCorrelationId: correlation,
      ttsServerRequestReceivedAt: requestReceivedAt,
      ttsServerParsingDoneAt: parsingDoneAt,
      ttsOpenAiRequestStartedAt: openAiStartedAt,
      ttsOpenAiFirstByteAt: null,
      ttsOpenAiCompletedAt: null,
      ttsServerFirstByteSentAt: null,
      ttsServerCompletedAt: null,
      ttsServerPreOpenAiMs: Math.round(preOpenAiMs),
      ttsOpenAiTimeToFirstByteMs: null,
      ttsOpenAiTotalMs: null,
      ttsServerStreamingOverheadMs: null,
      status: "streaming",
    });
    const reader = upstream.body!.getReader();
    let firstByteSeen = false;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            const openAiCompletedMono = performance.now();
            const openAiCompletedAt = new Date().toISOString();
            const serverCompletedMono = performance.now();
            const serverCompletedAt = new Date().toISOString();
            updateSpeechServerDiagnostics(correlation, {
              ttsOpenAiCompletedAt: openAiCompletedAt,
              ttsServerCompletedAt: serverCompletedAt,
              ttsOpenAiTotalMs: Math.round(
                openAiCompletedMono - openAiStartedMono,
              ),
              ttsServerStreamingOverheadMs: Math.round(
                serverCompletedMono - openAiCompletedMono,
              ),
              status: "completed",
            });
            controller.close();
            return;
          }
          if (!firstByteSeen && chunk.value.byteLength > 0) {
            firstByteSeen = true;
            const firstByteAt = new Date().toISOString();
            updateSpeechServerDiagnostics(correlation, {
              ttsOpenAiFirstByteAt: firstByteAt,
              ttsServerFirstByteSentAt: firstByteAt,
              ttsOpenAiTimeToFirstByteMs: Math.round(
                performance.now() - openAiStartedMono,
              ),
            });
          }
          controller.enqueue(chunk.value);
        } catch (error) {
          updateSpeechServerDiagnostics(correlation, { status: "failed" });
          controller.error(error);
        }
      },
      async cancel(reason) {
        updateSpeechServerDiagnostics(correlation, { status: "failed" });
        await reader.cancel(reason).catch(() => undefined);
      },
    });
    const timing = {
      ttsRequestCorrelationId: correlation,
      ttsServerRequestReceivedAt: requestReceivedAt,
      ttsServerParsingDoneAt: parsingDoneAt,
      ttsOpenAiRequestStartedAt: openAiStartedAt,
      ttsOpenAiResponseHeadersAt: upstreamHeadersAt,
      ttsServerPreOpenAiMs: Math.round(preOpenAiMs),
    };
    const serverTiming = serverTimingHeader({
      "app-pre": preOpenAiMs,
      "openai-headers": performance.now() - openAiStartedMono,
      total: performance.now() - requestReceivedMono,
    });
    return new Response(stream, {
      status: 200,
      headers: {
        // Keep the existing browser contract and MP3 decoding behavior stable.
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store",
        "X-Translator-Speech-Model": SPEECH_MODEL,
        [TRANSLATOR_CORRELATION_HEADER]: correlation,
        [SPEECH_TIMING_HEADER]: JSON.stringify(timing),
        ...(serverTiming ? { "Server-Timing": serverTiming } : {}),
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
