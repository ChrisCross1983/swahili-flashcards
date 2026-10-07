import { requireUser } from "@/lib/api/auth";
import { nativeProgressiveTtsPreviewEnabled } from "@/lib/translator/nativeProgressiveTtsFlag";
import { createOpenAISpeechGateway } from "@/lib/translator/server/openai";
import { generateTranslatorSpeech } from "@/lib/translator/server/speech";
import {
  getRequestCookie,
  nativeTtsCookieName,
  nativeTtsDiagnosticCookieName,
  openNativeTtsTicket,
  privateNativeTtsCookie,
  validNativeTtsMediaId,
} from "@/lib/translator/server/nativeProgressiveTtsTicket";

export const runtime = "nodejs";

type Context = { params: Promise<{ mediaId: string }> };

function rangeKind(value: string | null) {
  if (!value) return "none";
  if (value === "bytes=0-") return "bytes_0_open";
  if (value === "bytes=0-1") return "bytes_0_1";
  return /^bytes=\d+-/.test(value) ? "other_byte_range" : "other_range";
}

function fetchHeaderKind(value: string | null, allowed: readonly string[]) {
  if (!value) return null;
  return allowed.includes(value) ? value : "other";
}

function logMediaPhase(phase: string, details: Record<string, string | number | boolean | null>) {
  // This route is preview-gated. Never log IDs, cookies, text, audio, or request URLs.
  console.info("[translator][native-media-diagnostic]", { phase, ...details });
}

function firstChunkLooksLikeMp3(chunk: Uint8Array): boolean | null {
  if (chunk.byteLength < 3) return null;
  return (chunk[0] === 0x49 && chunk[1] === 0x44 && chunk[2] === 0x33) ||
    (chunk[0] === 0xff && (chunk[1] & 0xe0) === 0xe0);
}

async function authorize(request: Request, context: Context, onStage?: (stage: string) => void) {
  if (!nativeProgressiveTtsPreviewEnabled({
    vercelEnvironment: process.env.VERCEL_ENV,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
  })) { onStage?.("preview_disabled"); return null; }
  const { mediaId } = await context.params;
  const id = mediaId.endsWith(".mp3") ? mediaId.slice(0, -4) : "";
  if (!validNativeTtsMediaId(id)) { onStage?.("invalid_media_id"); return null; }
  const { user, response } = await requireUser();
  if (response || !user) { onStage?.("user_auth_failed"); return null; }
  const cookie = getRequestCookie(request, nativeTtsCookieName(id));
  if (!cookie) { onStage?.("ticket_cookie_missing"); return null; }
  const ticket = openNativeTtsTicket(cookie, id, user.id);
  onStage?.(ticket ? "ticket_valid" : "ticket_invalid_or_expired");
  return ticket ? { id, ticket } : null;
}

export async function HEAD(request: Request, context: Context) {
  const diagnosticEnabled = nativeProgressiveTtsPreviewEnabled({
    vercelEnvironment: process.env.VERCEL_ENV,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
  });
  if (diagnosticEnabled) logMediaPhase("head_route_entered", {
    at: new Date().toISOString(), status: null,
    range: rangeKind(request.headers.get("range")),
    cookieHeaderPresent: request.headers.has("cookie"),
  });
  let authStage = "unknown";
  const authorized = await authorize(request, context, (stage) => { authStage = stage; });
  if (!authorized) {
    if (diagnosticEnabled) logMediaPhase("head_rejected", {
      at: new Date().toISOString(), status: 404, authStage,
    });
    return new Response(null, { status: 404 });
  }
  if (diagnosticEnabled) logMediaPhase("head_authorized", {
    at: new Date().toISOString(), status: 200, authStage,
  });
  const firstChunkAt = getRequestCookie(request, nativeTtsDiagnosticCookieName(authorized.id));
  let timestamp = "";
  try { timestamp = firstChunkAt ? decodeURIComponent(firstChunkAt) : ""; } catch { /* invalid diagnostic cookie */ }
  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      ...(Number.isFinite(Date.parse(timestamp))
        ? { "X-Progressive-First-Server-Audio-Chunk-At": timestamp }
        : {}),
    },
  });
}

export async function GET(request: Request, context: Context) {
  const diagnosticEnabled = nativeProgressiveTtsPreviewEnabled({
    vercelEnvironment: process.env.VERCEL_ENV,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
  });
  const range = request.headers.get("range");
  const rangeCategory = rangeKind(range);
  if (diagnosticEnabled) logMediaPhase("route_entered", {
    at: new Date().toISOString(), status: null, range: rangeCategory,
    cookieHeaderPresent: request.headers.has("cookie"),
    acceptAudio: request.headers.get("accept")?.includes("audio") ?? null,
    fetchDest: fetchHeaderKind(request.headers.get("sec-fetch-dest"), ["audio", "empty", "document"]),
    fetchMode: fetchHeaderKind(request.headers.get("sec-fetch-mode"), ["no-cors", "cors", "navigate", "same-origin"]),
    fetchSite: fetchHeaderKind(request.headers.get("sec-fetch-site"), ["same-origin", "same-site", "cross-site", "none"]),
  });
  let authStage = "unknown";
  const authorized = await authorize(request, context, (stage) => { authStage = stage; });
  if (!authorized) {
    if (diagnosticEnabled) logMediaPhase("rejected", {
      at: new Date().toISOString(), status: 404, authStage, range: rangeCategory,
    });
    return new Response(null, { status: 404 });
  }
  logMediaPhase("authorized", { at: new Date().toISOString(), status: null, authStage, range: rangeCategory });
  // A dynamic, not-yet-generated MP3 has no known length or random-access bytes.
  // A zero-origin request may receive the full 200 body. Never pretend to serve 206.
  if (range && range !== "bytes=0-") {
    logMediaPhase("range_rejected", { at: new Date().toISOString(), status: 416, range: rangeCategory });
    return new Response(null, {
      status: 416,
      headers: { "Accept-Ranges": "none", "Cache-Control": "private, no-store" },
    });
  }

  const controller = new AbortController();
  let bytesEnqueued = 0;
  let streamEnded = false;
  const abort = () => {
    controller.abort();
    logMediaPhase("request_aborted", {
      at: new Date().toISOString(), status: null, bytesEnqueued, streamEnded,
    });
  };
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) controller.abort();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    logMediaPhase("openai_started", { at: new Date().toISOString(), status: null, range: rangeCategory });
    const gateway = createOpenAISpeechGateway();
    const upstream = await generateTranslatorSpeech(
      authorized.ticket.text,
      authorized.ticket.language,
      authorized.ticket.speed,
      gateway,
      controller.signal,
    );
    reader = upstream.body!.getReader();
    let first: ReadableStreamReadResult<Uint8Array>;
    do { first = await reader.read(); } while (!first.done && first.value.byteLength === 0);
    if (first.done) throw new Error("Empty speech stream");
    const firstChunkAt = new Date().toISOString();
    bytesEnqueued = first.value.byteLength;
    logMediaPhase("first_mp3_chunk", {
      at: firstChunkAt, status: 200, firstChunkBytes: first.value.byteLength,
      mp3SignatureValid: firstChunkLooksLikeMp3(first.value),
    });
    const activeReader = reader;
    const stream = new ReadableStream<Uint8Array>({
      start(out) { out.enqueue(first.value); },
      async pull(out) {
        try {
          const chunk = await activeReader.read();
          if (chunk.done) {
            streamEnded = true;
            logMediaPhase("stream_completed", {
              at: new Date().toISOString(), status: 200, bytesEnqueued,
            });
            request.signal.removeEventListener("abort", abort);
            out.close();
          } else {
            bytesEnqueued += chunk.value.byteLength;
            out.enqueue(chunk.value);
          }
        } catch (error) {
          logMediaPhase("stream_failed", {
            at: new Date().toISOString(), status: 200, bytesEnqueued,
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
          out.error(error);
        }
      },
      async cancel(reason) {
        controller.abort();
        logMediaPhase("stream_cancelled", {
          at: new Date().toISOString(), status: 200, bytesEnqueued,
        });
        request.signal.removeEventListener("abort", abort);
        await activeReader.cancel(reason).catch(() => undefined);
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store",
        "Accept-Ranges": "none",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline; filename=speech.mp3",
        "Set-Cookie": privateNativeTtsCookie(
          nativeTtsDiagnosticCookieName(authorized.id),
          encodeURIComponent(firstChunkAt),
        ),
      },
    });
  } catch (error) {
    logMediaPhase("upstream_failed", {
      at: new Date().toISOString(), status: 502, bytesEnqueued,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    controller.abort();
    request.signal.removeEventListener("abort", abort);
    await reader?.cancel().catch(() => undefined);
    return new Response(null, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
