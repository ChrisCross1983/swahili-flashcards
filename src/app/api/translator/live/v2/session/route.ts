import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { LIVE_V2_CONFIG } from "@/lib/translator/live/v2/config";

export const runtime = "nodejs";

type ClientSecretResponse = { value?: unknown; expires_at?: unknown };

export async function POST() {
  const { user, response } = await requireUser();
  if (response) return response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[translator-live-v2][session] missing_api_key");
    return NextResponse.json(
      { error: "Live-Übersetzung ist gerade nicht verfügbar." },
      { status: 503 },
    );
  }

  const safetyIdentifier = `live_v2_${createHash("sha256")
    .update(user.id)
    .digest("hex")
    .slice(0, 32)}`;

  try {
    const upstream = await fetch(LIVE_V2_CONFIG.clientSecretEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: LIVE_V2_CONFIG.clientSecretTtlSeconds,
        },
        session: {
          type: "transcription",
          audio: {
            input: {
              noise_reduction: { type: "far_field" },
              transcription: {
                model: LIVE_V2_CONFIG.transcriptionModel,
                languages: LIVE_V2_CONFIG.expectedLanguages,
                keywords: LIVE_V2_CONFIG.keywords,
                prompt: LIVE_V2_CONFIG.transcriptionPrompt,
              },
              turn_detection: null,
            },
          },
        },
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      console.error("[translator-live-v2][session] upstream_failed", {
        status: upstream.status,
      });
      return NextResponse.json(
        { error: "Live-Übersetzung ist gerade nicht verfügbar." },
        { status: 503 },
      );
    }

    const body = (await upstream.json()) as ClientSecretResponse;
    if (typeof body.value !== "string" || typeof body.expires_at !== "number") {
      console.error("[translator-live-v2][session] invalid_upstream_response");
      return NextResponse.json(
        { error: "Live-Übersetzung ist gerade nicht verfügbar." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        clientSecret: body.value,
        expiresAt: body.expires_at,
        transcriptionModel: LIVE_V2_CONFIG.transcriptionModel,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("[translator-live-v2][session] request_failed");
    return NextResponse.json(
      { error: "Live-Übersetzung ist gerade nicht verfügbar." },
      { status: 503 },
    );
  }
}
