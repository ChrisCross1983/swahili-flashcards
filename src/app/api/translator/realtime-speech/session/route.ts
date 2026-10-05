import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { REALTIME_21_OUTPUT_MODEL, SPEECH_VOICE } from "@/lib/translator/server/models";

export const runtime = "nodejs";

const CLIENT_SECRET_ENDPOINT = "https://api.openai.com/v1/realtime/client_secrets";
const CLIENT_SECRET_TTL_SECONDS = 60;

type ClientSecretResponse = { value?: unknown; expires_at?: unknown };

/**
 * Creates a short-lived browser credential for the Classic text-to-audio
 * transport. No Terra text or OpenAI API key is returned by this route.
 */
export async function POST() {
  const { user, response } = await requireUser();
  if (response) return response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[translator][realtime-speech-session] missing_api_key");
    return NextResponse.json(
      { error: "Die Sprachausgabe ist gerade nicht verfügbar." },
      { status: 503 },
    );
  }

  const safetyIdentifier = `classic_realtime_speech_${createHash("sha256")
    .update(user.id)
    .digest("hex")
    .slice(0, 32)}`;

  try {
    const upstream = await fetch(CLIENT_SECRET_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: CLIENT_SECRET_TTL_SECONDS,
        },
        session: {
          type: "realtime",
          model: REALTIME_21_OUTPUT_MODEL,
          output_modalities: ["audio"],
          instructions: [
            "You are a deterministic speech renderer.",
            "Only speak the exact text supplied in the response request.",
            "Do not translate, paraphrase, summarize, correct, explain, or add words.",
          ].join(" "),
          audio: { output: { voice: SPEECH_VOICE } },
        },
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      console.error("[translator][realtime-speech-session] upstream_failed", {
        status: upstream.status,
      });
      return NextResponse.json(
        { error: "Die Sprachausgabe ist gerade nicht verfügbar." },
        { status: 503 },
      );
    }

    const body = (await upstream.json()) as ClientSecretResponse;
    if (typeof body.value !== "string" || typeof body.expires_at !== "number") {
      console.error("[translator][realtime-speech-session] invalid_upstream_response");
      return NextResponse.json(
        { error: "Die Sprachausgabe ist gerade nicht verfügbar." },
        { status: 503 },
      );
    }

    return NextResponse.json({
      clientSecret: body.value,
      expiresAt: body.expires_at,
      model: REALTIME_21_OUTPUT_MODEL,
      voice: SPEECH_VOICE,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[translator][realtime-speech-session] request_failed");
    return NextResponse.json(
      { error: "Die Sprachausgabe ist gerade nicht verfügbar." },
      { status: 503 },
    );
  }
}
