import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { validateSentenceInput } from "@/lib/sentence/explanation";
import { getOrCheckSentenceLanguages, SentenceLanguageRateLimitError } from "@/lib/sentence/languageCheck";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 4096) throw new Error("large");
    body = JSON.parse(raw);
  } catch { return NextResponse.json({ code: "invalid_input" }, { status: 400 }); }
  const input = validateSentenceInput(body);
  if (!input) return NextResponse.json({ code: "invalid_input" }, { status: 400 });

  try {
    const result = await getOrCheckSentenceLanguages(user.id, input.german, input.swahili);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SentenceLanguageRateLimitError) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
    // No sentence text, provider detail, or credential reaches logs or browser.
    console.error("[sentence-language-check] validation_unavailable");
    return NextResponse.json({ code: "validation_unavailable" }, { status: 503 });
  }
}
