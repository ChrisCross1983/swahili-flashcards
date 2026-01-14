import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const LEITNER_INTERVAL_DAYS = [1, 2, 6, 14, 30, 60];
const MAX_LEVEL = LEITNER_INTERVAL_DAYS.length - 1;

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function addDaysYmd(base: Date, days: number) {
  const safeDays = Number.isFinite(days) ? days : 1;

  const safeBase =
    base instanceof Date && !Number.isNaN(base.getTime()) ? base : new Date();
  const d = new Date(safeBase);
  d.setDate(d.getDate() + safeDays);

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

  const lvlRaw = Number.isFinite(body.currentLevel)
    ? (body.currentLevel as number)
    : 0;
  const currentLevel = Math.min(Math.max(lvlRaw, 0), MAX_LEVEL);

  const newLevel = body.correct
    ? Math.min(currentLevel + 1, MAX_LEVEL)
    : 0;

  const nextIntervalDays = LEITNER_INTERVAL_DAYS[newLevel] ?? 1;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = addDaysYmd(today, nextIntervalDays);

  const nowIso = new Date().toISOString();

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
