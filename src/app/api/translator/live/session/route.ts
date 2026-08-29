import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { LIVE_TRANSLATOR_BETA } from "@/lib/translator/live/config";
import type { LiveLanguage } from "@/lib/translator/live/types";

type OpenAISecretResponse = { value?: unknown; expires_at?: unknown };

async function createTranslationSecret(
  apiKey: string,
  safetyIdentifier: string,
  targetLanguage: LiveLanguage,
) {
  const response = await fetch(LIVE_TRANSLATOR_BETA.sessionEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier,
    },
    body: JSON.stringify({
      expires_after: {
        anchor: "created_at",
        seconds: LIVE_TRANSLATOR_BETA.clientSecretTtlSeconds,
      },
      session: {
        model: LIVE_TRANSLATOR_BETA.model,
        audio: {
          input: {
            transcription: { model: LIVE_TRANSLATOR_BETA.transcriptionModel },
            noise_reduction: { type: "far_field" },
          },
          output: { language: targetLanguage },
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("[translator-live][session] upstream_failed", {
      status: response.status,
      targetLanguage,
    });
    throw new Error("upstream_failed");
  }

  const body = (await response.json()) as OpenAISecretResponse;
  if (typeof body.value !== "string" || typeof body.expires_at !== "number") {
    console.error("[translator-live][session] invalid_upstream_response", {
      targetLanguage,
    });
    throw new Error("invalid_upstream_response");
  }

  return {
    targetLanguage,
    clientSecret: body.value,
    expiresAt: body.expires_at,
  };
}

export async function POST() {
  const { user, response } = await requireUser();
  if (response) return response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[translator-live][session] missing_api_key");
    return NextResponse.json(
      { error: "Live-Übersetzung ist gerade nicht verfügbar." },
      { status: 503 },
    );
  }

  const safetyIdentifier = `live_${createHash("sha256")
    .update(user.id)
    .digest("hex")
    .slice(0, 32)}`;

  try {
    const sessions = await Promise.all(
      (["sw", "de"] as const).map((language) =>
        createTranslationSecret(apiKey, safetyIdentifier, language),
      ),
    );
    return NextResponse.json(
      { sessions },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Live-Übersetzung ist gerade nicht verfügbar." },
      { status: 503 },
    );
  }
}

