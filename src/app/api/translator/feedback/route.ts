import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseTranslatorFeedback } from "@/lib/translator/server/feedback";
import { classifyFeedbackDatabaseError } from "@/lib/translator/server/feedbackDatabaseError";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const feedback = parseTranslatorFeedback(body);
  if (!feedback) {
    return NextResponse.json({ error: "Ungültiges Feedback." }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("translator_feedback")
    .upsert(
      { owner_key: user.id, ...feedback },
      { onConflict: "owner_key,translation_entry_id" },
    )
    .select("id")
    .single();

  if (error || !data?.id) {
    const databaseCode = error?.code ?? "missing_result";
    const classification = classifyFeedbackDatabaseError(error);
    console.error("[translator] feedback write failed", {
      code: databaseCode,
      ...classification,
    });
    if (classification.reason !== "feedback_database_error") {
      return NextResponse.json(
        {
          code: "feedback_storage_unavailable",
          error: "Feedback konnte gerade nicht gespeichert werden.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Feedback konnte nicht gespeichert werden." },
      { status: 500 },
    );
  }

  return NextResponse.json({ saved: true, feedbackId: data.id });
}
