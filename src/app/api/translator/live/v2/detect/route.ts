import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { detectLiveLanguageOnServer } from "@/lib/translator/live/server/languageDetector";

const MAX_TRANSCRIPT_LENGTH = 5_000;

export async function POST(request: Request) {
  const { response } = await requireUser();
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const text = typeof payload.authoritativeTranscript === "string"
    ? payload.authoritativeTranscript.trim()
    : "";
  const expectedLanguage = payload.expectedLanguage === "de" || payload.expectedLanguage === "sw"
    ? payload.expectedLanguage
    : null;
  if (!text || text.length > MAX_TRANSCRIPT_LENGTH) {
    return NextResponse.json({ code: "invalid_transcript" }, { status: 400 });
  }

  try {
    const language = await detectLiveLanguageOnServer(
      text,
      process.env.OPENAI_API_KEY,
      expectedLanguage,
    );
    return NextResponse.json(
      { language, classificationSource: "terra" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("[translator-live-v2][language] detection_failed");
    return NextResponse.json({ code: "detection_failed" }, { status: 503 });
  }
}
