import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { detectLiveLanguageOnServer } from "@/lib/translator/live/server/languageDetector";

const MAX_TRANSCRIPT_LENGTH = 5_000;

function invalidRequest(code: string, reason: string) {
  return NextResponse.json(
    { language: "unknown", code, reason },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const { response } = await requireUser();
  if (response) return response;

  let text: unknown;
  try {
    text = ((await request.json()) as { text?: unknown }).text;
  } catch {
    return invalidRequest("invalid_json", "malformed_request_body");
  }

  if (typeof text !== "string") return invalidRequest("missing_text", "text_must_be_string");
  if (!text.trim()) return invalidRequest("empty_transcript", "transcript_is_empty");
  if (text.length > MAX_TRANSCRIPT_LENGTH) {
    return invalidRequest("transcript_too_long", "transcript_exceeds_limit");
  }

  try {
    const language = await detectLiveLanguageOnServer(text.trim());
    return NextResponse.json(
      { language },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("[translator-live][language] detection_failed");
    return NextResponse.json(
      { language: "unknown", code: "detection_failed", reason: "provider_unavailable" },
      { status: 503 },
    );
  }
}
