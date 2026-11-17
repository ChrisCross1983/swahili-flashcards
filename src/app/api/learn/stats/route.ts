import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getIntervalDays } from "@/lib/leitner";
import { requireUser } from "@/lib/api/auth";

type ProgressStatsRow = {
  level?: number | null;
  due_date?: string | null;
};

function labelForLevel(level: number) {
  const days = getIntervalDays(level);
  if (days === 1) return "Morgen (1 Tag)";
  return `In ${days} Tagen`;
}

function daysUntil(dateStr: string) {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(`${dateStr}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000);
}

function addDaysYmd(base: Date, days: number) {
  const d = new Date(base);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const ownerKey = user.id;
  const typeParam = searchParams.get("type");
  const resolvedType =
    typeParam === "sentence" ? "sentence" : typeParam === "vocab" ? "vocab" : null;

  const todayDate = new Date();
  const today = todayDate.toISOString().slice(0, 10); // YYYY-MM-DD
  const tomorrow = addDaysYmd(todayDate, 1);

  let query = supabaseServer
    .from("card_progress")
    .select("level, due_date, cards!inner(type)")
    .eq("owner_key", ownerKey);

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

  const rows = data ?? [];
  const total = rows.length;

  let dueTodayCount = 0;
  let dueTomorrowCount = 0;
  let dueLaterCount = 0;

  // counts by level
  const map = new Map<number, number>();
  for (const r of rows) {
    const lvl = Number(r.level ?? 0);
    map.set(lvl, (map.get(lvl) ?? 0) + 1);


    const dueDate = r.due_date as string | null;
    if (!dueDate) {
      dueLaterCount += 1;
      continue;
    }

    if (dueDate <= today) {
      dueTodayCount += 1;
    } else if (dueDate === tomorrow) {
      dueTomorrowCount += 1;
    } else {
      dueLaterCount += 1;
    }
  }

  // next due date (strictly after today)
  const futureDue = rows
    .map((r: ProgressStatsRow) => r.due_date)
    .filter((d): d is string => Boolean(d))
    .filter((d) => d > today)
    .sort()[0] ?? null;

  const byLevel = Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([level, count]) => ({
      level,
      label: labelForLevel(level),
      count,
    }));

  return NextResponse.json({
    total,
    byLevel,
    dueTodayCount,
    dueTomorrowCount,
    dueLaterCount,
    nextDueDate: futureDue,
    nextDueInDays: futureDue ? daysUntil(futureDue) : null,
  });
}
