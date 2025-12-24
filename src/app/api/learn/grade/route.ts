import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const intervals = [1, 3, 7, 14, 30, 60]; // Tage

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

type Body = {
  ownerKey: string;
  cardId: string;
  correct: boolean;
  currentLevel: number;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  if (!body.ownerKey || !body.cardId) {
    return NextResponse.json(
      { error: "ownerKey and cardId are required" },
      { status: 400 }
    );
  }

  const today = new Date();

  let newLevel = body.correct
    ? Math.min(body.currentLevel + 1, 5)
    : 0;

  const dueDate = body.correct
    ? addDays(today, intervals[newLevel])
    : addDays(today, 1);

  const { error } = await supabaseServer
    .from("card_progress")
    .update({
      level: newLevel,
      due_date: dueDate,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("owner_key", body.ownerKey)
    .eq("card_id", body.cardId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, newLevel, dueDate });
}
