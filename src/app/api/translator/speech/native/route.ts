import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { nativeProgressiveTtsPreviewEnabled } from "@/lib/translator/nativeProgressiveTtsFlag";
import { MAX_SPEECH_TEXT_LENGTH } from "@/lib/translator/server/speech";
import { isValidSpeechSpeed } from "@/lib/translator/speechSpeed";
import {
  NATIVE_TTS_TICKET_TTL_SECONDS,
  nativeTtsCookieName,
  newNativeTtsMediaId,
  privateNativeTtsCookie,
  sealNativeTtsTicket,
} from "@/lib/translator/server/nativeProgressiveTtsTicket";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!nativeProgressiveTtsPreviewEnabled({
    vercelEnvironment: process.env.VERCEL_ENV,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
  })) return new Response(null, { status: 404 });

  const { user, response } = await requireUser();
  if (response || !user) return response;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const text = typeof input?.text === "string" ? input.text.trim() : "";
  const language = input?.language;
  const speed = input?.speed;
  if (!text || text.length > MAX_SPEECH_TEXT_LENGTH ||
      (language !== "de" && language !== "sw") || !isValidSpeechSpeed(speed)) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  }

  const id = newNativeTtsMediaId();
  let sealed: string;
  try {
    sealed = sealNativeTtsTicket({
      id, userId: user.id, text, language, speed,
      expiresAt: Date.now() + NATIVE_TTS_TICKET_TTL_SECONDS * 1_000,
    });
  } catch {
    return NextResponse.json({ code: "native_tts_unavailable" }, { status: 503 });
  }
  // Browser cookie limits vary; never truncate the Terra text.
  if (sealed.length > 3_500) {
    return NextResponse.json({ code: "native_tts_ticket_too_large" }, { status: 413 });
  }
  const result = NextResponse.json(
    { mediaUrl: `/api/translator/speech/native/${id}.mp3` },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  result.headers.append("Set-Cookie", privateNativeTtsCookie(nativeTtsCookieName(id), sealed));
  return result;
}
