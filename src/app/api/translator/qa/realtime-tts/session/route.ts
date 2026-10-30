import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import {
  REALTIME_TTS_QA_MODEL,
  REALTIME_TTS_QA_VOICE,
  realtimeTtsQaPreviewEnabled,
  realtimeTtsQaSpeed,
} from "@/lib/translator/realtimeTtsQa";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!realtimeTtsQaPreviewEnabled()) {
    return NextResponse.json({ error: "Nicht verfügbar." }, { status: 404 });
  }
  const { user, response } = await requireUser();
  if (response) return response;
  let language: "de" | "sw";
  try {
    const body = await request.json();
    if (body?.language !== "de" && body?.language !== "sw") throw new Error("invalid language");
    language = body.language;
  } catch { return NextResponse.json({ error: "Ungültige Sprache." }, { status: 400 }); }
  const configuredSpeechSpeed = realtimeTtsQaSpeed(language);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Nicht verfügbar." }, { status: 503 });

  try {
    const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": createHash("sha256").update(user.id).digest("hex"),
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 60 },
        session: {
          type: "realtime",
          model: REALTIME_TTS_QA_MODEL,
          output_modalities: ["audio"],
          tools: [],
          tool_choice: "none",
          audio: {
            input: { turn_detection: null },
            output: { voice: REALTIME_TTS_QA_VOICE, speed: configuredSpeechSpeed },
          },
        },
      }),
      cache: "no-store",
    });
    if (!upstream.ok) return NextResponse.json({ error: "Session nicht verfügbar." }, { status: 503 });
    const body: unknown = await upstream.json();
    if (!body || typeof body !== "object" || !("value" in body) || typeof body.value !== "string") {
      return NextResponse.json({ error: "Ungültige Session." }, { status: 503 });
    }
    return NextResponse.json({ clientSecret: body.value, model: REALTIME_TTS_QA_MODEL, voice: REALTIME_TTS_QA_VOICE, configuredSpeechSpeed }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Session nicht verfügbar." }, { status: 503 });
  }
}
