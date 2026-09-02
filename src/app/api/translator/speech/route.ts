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
import {
  otherPreOpenAiTiming,
  roundedServerTiming,
  ServerStageTimings,
} from "@/lib/translator/server/preOpenAiTimings";

export const runtime = "nodejs";

type TtsPreOpenAiStage =
  | "auth"
  | "authClientPreparation"
  | "authUserLookup"
  | "bodyRead"
  | "jsonParse"
  | "validation"
  | "normalization"
  | "openAiClientPreparation"
  | "instructionPreparation";

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
  const stages = new ServerStageTimings<TtsPreOpenAiStage>();
  const correlationId = validCorrelationId(
    request.headers.get(TRANSLATOR_CORRELATION_HEADER),
  );
  stages.start("auth");
  const { response } = await requireUser({
    onClientPreparationStarted: () => {
      stages.start("authClientPreparation");
    },
    onClientPreparationCompleted: () => {
      stages.complete("authClientPreparation");
    },
    onUserLookupStarted: () => {
      stages.start("authUserLookup");
    },
    onUserLookupCompleted: () => {
      stages.complete("authUserLookup");
    },
  });
  stages.complete("auth");
  if (response) return response;

  let bodyText: string;
  stages.start("bodyRead");
  try {
    bodyText = await request.text();
  } catch {
    stages.complete("bodyRead");
    return errorResponse(400, "invalid_request", "Ungültige Anfrage.");
  }
  stages.complete("bodyRead");
  let body: unknown;
  stages.start("jsonParse");
  try {
    body = JSON.parse(bodyText);
  } catch {
    stages.complete("jsonParse");
    return errorResponse(400, "invalid_request", "Ungültige Anfrage.");
  }
  stages.complete("jsonParse");

  stages.start("normalization");
  const payload = body && typeof body === "object"
    ? body as Record<string, unknown>
    : null;
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  const language = parseLanguage(payload?.language);
  const speed = payload?.speed;
  stages.complete("normalization");
  stages.start("validation");
  if (!body || typeof body !== "object") {
    stages.complete("validation");
    return errorResponse(400, "invalid_request", "Ungültige Anfrage.");
  }

  if (!text) {
    stages.complete("validation");
    return errorResponse(400, "invalid_text", "Text für die Sprachausgabe fehlt.");
  }
  if (!language) {
    stages.complete("validation");
    return errorResponse(400, "invalid_language", "Ungültige Sprache.");
  }
  if (!isValidSpeechSpeed(speed)) {
    stages.complete("validation");
    return errorResponse(400, "invalid_speed", "Ungültiges Sprechtempo.");
  }
  if (text.length > MAX_SPEECH_TEXT_LENGTH) {
    stages.complete("validation");
    return errorResponse(413, "text_too_long", "Der Text ist zu lang.");
  }
  stages.complete("validation");

  try {
    const parsingDoneAt = new Date().toISOString();
    const serviceEnteredAt = new Date().toISOString();
    const openAiStart: { mono: number | null; at: string | null } = {
      mono: null,
      at: null,
    };
    stages.start("openAiClientPreparation");
    const gateway = createOpenAISpeechGateway(undefined, {
      onInstructionPreparationStarted: () => {
        stages.start("instructionPreparation");
      },
      onInstructionPreparationCompleted: () => {
        stages.complete("instructionPreparation");
      },
      onSpeechRequestStarted: () => {
        openAiStart.mono = performance.now();
        openAiStart.at = new Date().toISOString();
      },
    });
    const openAiClientReadyAt = stages.complete("openAiClientPreparation");
    const upstream = await generateTranslatorSpeech(
      text,
      language,
      speed,
      gateway,
      request.signal,
    );
    const openAiStartedMono = openAiStart.mono;
    const openAiStartedAt = openAiStart.at;
    if (openAiStartedMono === null || openAiStartedAt === null) {
      throw new Error("Speech gateway did not report request start");
    }
    const upstreamHeadersAt = new Date().toISOString();
    const preOpenAiMs = openAiStartedMono - requestReceivedMono;
    const ttsStageDurations = {
      ttsAuthMs: stages.duration("auth"),
      ttsBodyReadMs: stages.duration("bodyRead"),
      ttsJsonParseMs: stages.duration("jsonParse"),
      ttsValidationMs: stages.duration("validation"),
      ttsNormalizationMs: stages.duration("normalization"),
      ttsInstructionPreparationMs: stages.duration("instructionPreparation"),
      ttsOpenAiClientPreparationMs: stages.duration("openAiClientPreparation"),
    };
    const ttsOtherPreOpenAiMs = otherPreOpenAiTiming(
      preOpenAiMs,
      Object.values(ttsStageDurations),
    );
    const preOpenAiDiagnostics = {
      ttsRouteReceivedAt: requestReceivedAt,
      ttsAuthStartedAt: stages.startedAt("auth"),
      ttsAuthCompletedAt: stages.completedAt("auth"),
      ttsAuthClientPreparationStartedAt:
        stages.startedAt("authClientPreparation"),
      ttsAuthClientPreparationCompletedAt:
        stages.completedAt("authClientPreparation"),
      ttsAuthUserLookupStartedAt: stages.startedAt("authUserLookup"),
      ttsAuthUserLookupCompletedAt: stages.completedAt("authUserLookup"),
      ttsBodyReadStartedAt: stages.startedAt("bodyRead"),
      ttsBodyReadCompletedAt: stages.completedAt("bodyRead"),
      ttsJsonParseStartedAt: stages.startedAt("jsonParse"),
      ttsJsonParseCompletedAt: stages.completedAt("jsonParse"),
      ttsValidationStartedAt: stages.startedAt("validation"),
      ttsValidationCompletedAt: stages.completedAt("validation"),
      ttsInputNormalizationStartedAt: stages.startedAt("normalization"),
      ttsInputNormalizationCompletedAt: stages.completedAt("normalization"),
      ttsServiceEnteredAt: serviceEnteredAt,
      ttsInstructionPreparationStartedAt:
        stages.startedAt("instructionPreparation"),
      ttsInstructionPreparationCompletedAt:
        stages.completedAt("instructionPreparation"),
      ttsOpenAiClientReadyAt: openAiClientReadyAt,
      ttsAuthMs: roundedServerTiming(ttsStageDurations.ttsAuthMs),
      ttsAuthClientPreparationMs: roundedServerTiming(
        stages.duration("authClientPreparation"),
      ),
      ttsAuthUserLookupMs: roundedServerTiming(
        stages.duration("authUserLookup"),
      ),
      ttsBodyReadMs: roundedServerTiming(ttsStageDurations.ttsBodyReadMs),
      ttsJsonParseMs: roundedServerTiming(ttsStageDurations.ttsJsonParseMs),
      ttsValidationMs: roundedServerTiming(ttsStageDurations.ttsValidationMs),
      ttsNormalizationMs: roundedServerTiming(
        ttsStageDurations.ttsNormalizationMs,
      ),
      ttsInstructionPreparationMs: roundedServerTiming(
        ttsStageDurations.ttsInstructionPreparationMs,
      ),
      ttsOpenAiClientPreparationMs: roundedServerTiming(
        ttsStageDurations.ttsOpenAiClientPreparationMs,
      ),
      ttsOtherPreOpenAiMs: roundedServerTiming(ttsOtherPreOpenAiMs),
    };
    const correlation = correlationId ?? `tts-server-${Date.now()}`;
    setSpeechServerDiagnostics(correlation, {
      ttsRequestCorrelationId: correlation,
      ttsServerRequestReceivedAt: requestReceivedAt,
      ttsServerParsingDoneAt: parsingDoneAt,
      ttsOpenAiRequestStartedAt: openAiStartedAt,
      ...preOpenAiDiagnostics,
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
      ...preOpenAiDiagnostics,
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
