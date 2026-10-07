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

async function authorize(request: Request, context: Context) {
  if (!nativeProgressiveTtsPreviewEnabled({
    vercelEnvironment: process.env.VERCEL_ENV,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
  })) return null;
  const { mediaId } = await context.params;
  const id = mediaId.endsWith(".mp3") ? mediaId.slice(0, -4) : "";
  if (!validNativeTtsMediaId(id)) return null;
  const { user, response } = await requireUser();
  if (response || !user) return null;
  const ticket = openNativeTtsTicket(getRequestCookie(request, nativeTtsCookieName(id)), id, user.id);
  return ticket ? { id, ticket } : null;
}

export async function HEAD(request: Request, context: Context) {
  const authorized = await authorize(request, context);
  if (!authorized) return new Response(null, { status: 404 });
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
  const authorized = await authorize(request, context);
  if (!authorized) return new Response(null, { status: 404 });
  const range = request.headers.get("range");
  // A dynamic, not-yet-generated MP3 has no known length or random-access bytes.
  // A zero-origin request may receive the full 200 body. Never pretend to serve 206.
  if (range && range !== "bytes=0-") {
    return new Response(null, {
      status: 416,
      headers: { "Accept-Ranges": "none", "Cache-Control": "private, no-store" },
    });
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) controller.abort();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
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
    const activeReader = reader;
    const stream = new ReadableStream<Uint8Array>({
      start(out) { out.enqueue(first.value); },
      async pull(out) {
        try {
          const chunk = await activeReader.read();
          if (chunk.done) {
            request.signal.removeEventListener("abort", abort);
            out.close();
          } else {
            out.enqueue(chunk.value);
          }
        } catch (error) {
          out.error(error);
        }
      },
      async cancel(reason) {
        controller.abort();
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
  } catch {
    controller.abort();
    request.signal.removeEventListener("abort", abort);
    await reader?.cancel().catch(() => undefined);
    return new Response(null, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
