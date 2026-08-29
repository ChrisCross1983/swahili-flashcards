import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { createOpenAITranslatorGateway } from "@/lib/translator/server/openai";
import { TRANSLATION_MODEL } from "@/lib/translator/server/models";

const MAX_TEXT_LENGTH = 5_000;

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
  const sourceLanguage = payload.sourceLanguage;
  const targetLanguage = payload.targetLanguage;
  const validDirection =
    (sourceLanguage === "de" && targetLanguage === "sw") ||
    (sourceLanguage === "sw" && targetLanguage === "de");
  if (!text || text.length > MAX_TEXT_LENGTH || !validDirection) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  }

  try {
    const translatedText = (
      await createOpenAITranslatorGateway().translate(text, {
        sourceLanguage,
        targetLanguage,
      })
    ).trim();
    if (!translatedText) throw new Error("empty_translation");
    return NextResponse.json(
      { translatedText, translationModel: TRANSLATION_MODEL },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("[translator-live-v2][translation] failed", {
      sourceLanguage,
      targetLanguage,
    });
    return NextResponse.json({ code: "translation_failed" }, { status: 502 });
  }
}
