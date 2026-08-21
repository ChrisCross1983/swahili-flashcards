import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseTranslatorFeedback } from "@/lib/translator/server/feedback";

export const runtime = "nodejs";

const REQUIRED_FEEDBACK_MIGRATION =
  "supabase/migrations/20260820000000_translator_feedback.sql";

function isMissingFeedbackTableError(code: string | undefined) {
  return code === "42P01" || code === "PGRST205";
}

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
    const tableMissing = isMissingFeedbackTableError(error?.code);
    console.error("[translator] feedback write failed", {
      code: databaseCode,
      reason: tableMissing ? "table_missing" : "database_error",
      ...(tableMissing
        ? { requiredMigration: REQUIRED_FEEDBACK_MIGRATION }
        : {}),
    });
    if (tableMissing) {
      return NextResponse.json(
        {
          code: "feedback_storage_unavailable",
          error: "Feedback-Speicher ist nicht verfügbar.",
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
