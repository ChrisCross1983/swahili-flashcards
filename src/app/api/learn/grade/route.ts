import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const intervals = [1, 3, 7, 14, 30, 60]; // Tage für Level 0..5

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function addDaysSafe(base: Date, days: number) {
  const safeDays = Number.isFinite(days) ? days : 1;

  const safeBase = base instanceof Date && !Number.isNaN(base.getTime())
    ? base
    : new Date();

  const d = new Date(safeBase);
  d.setDate(d.getDate() + safeDays);

  if (Number.isNaN(d.getTime())) {
    return toYmd(new Date());
  }

  return toYmd(d);
}

type Body = {
  ownerKey: string;
  cardId: string;
  correct: boolean;
  currentLevel?: number;
};

export async function POST(req: Request) {
  let body: Body;

  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ownerKey = (body.ownerKey ?? "").trim();
  const cardId = (body.cardId ?? "").trim();

  if (!ownerKey || !cardId) {
    return NextResponse.json(
      { error: "ownerKey and cardId are required" },
      { status: 400 }
    );
  }

  const lvlRaw = Number.isFinite(body.currentLevel) ? (body.currentLevel as number) : 0;
  const currentLevel = Math.min(Math.max(lvlRaw, 0), 5);

  const newLevel = body.correct
    ? Math.min(currentLevel + 1, 5)
    : 0;

  const nextIntervalDays =
    Number.isFinite(intervals[newLevel]) ? intervals[newLevel] : 1;

  const now = new Date();
  const dueDate = body.correct
    ? addDaysSafe(now, nextIntervalDays)
    : addDaysSafe(now, 1);

  const nowIso = now.toISOString();

  const { error } = await supabaseServer
    .from("card_progress")
    .update({
      level: newLevel,
      due_date: dueDate,
      last_seen_at: nowIso,
      updated_at: nowIso,
    })
    .eq("owner_key", ownerKey)
    .eq("card_id", cardId);

  if (error) {
    console.error("[learn/grade] update error", error);
    return NextResponse.json(
      { error: "Update failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, newLevel, dueDate });
}
