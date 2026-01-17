import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import {
  getIntervalDays,
  getNextLevelOnWrong,
  MAX_LEVEL,
} from "@/lib/leitner";

function toYmdUtc(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysYmdUtc(base: Date, days: number) {
  const safeDays = Number.isFinite(days) ? days : 1;
  const safeBase =
    base instanceof Date && !Number.isNaN(base.getTime()) ? base : new Date();

  const d = new Date(safeBase);
  d.setUTCDate(d.getUTCDate() + safeDays);
  return toYmdUtc(d);
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
    : getNextLevelOnWrong(currentLevel);

  let nextIntervalDays = getIntervalDays(newLevel);
  if (!Number.isFinite(nextIntervalDays) || nextIntervalDays < 1) {
    nextIntervalDays = 1;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dueDate = addDaysYmdUtc(today, nextIntervalDays);

  const nowIso = new Date().toISOString();

  console.log("[learn/grade] computed", { ownerKey, cardId, currentLevel, newLevel, nextIntervalDays, dueDate });
  
  const { data, error } = await supabaseServer
    .from("card_progress")
    .upsert(
      {
        owner_key: ownerKey,
        card_id: cardId,
        level: newLevel,
        due_date: dueDate,
        last_seen_at: nowIso,
        updated_at: nowIso,
      },
      {
        onConflict: "owner_key,card_id",
      }
    )
    .select();

  if (error) {
    console.error("[learn/grade] upsert error", error);
    return NextResponse.json(
      { error: "Update failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, newLevel, dueDate });
}
