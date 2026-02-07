import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ownerKey = searchParams.get("ownerKey");
  const typeParam = searchParams.get("type");
  const resolvedType =
    typeParam === "sentence" ? "sentence" : typeParam === "vocab" ? "vocab" : null;

  if (!ownerKey) {
    return NextResponse.json({ error: "ownerKey is required" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  let query = supabaseServer
    .from("card_progress")
    .select(
      `
      card_id,
      level,
      due_date,
      cards!inner(id, german_text, swahili_text, image_path, audio_path, type)
    `
    )
    .eq("owner_key", ownerKey)
    .lte("due_date", today)
    .order("due_date", { ascending: true });

  if (resolvedType === "sentence") {
    query = query.eq("cards.type", "sentence");
  }

  if (resolvedType === "vocab") {
    query = query.or("type.is.null,type.eq.vocab", { foreignTable: "cards" });
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((row: any) => ({
    cardId: row.card_id,
    level: row.level,
    dueDate: row.due_date,
    german: row.cards.german_text,
    swahili: row.cards.swahili_text,
    imagePath: row.cards.image_path ?? null,
    audio_path: row.cards.audio_path ?? null,
    type: row.cards.type ?? null,
  }));

  return NextResponse.json({ items });
}
