import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getIntervalDays } from "@/lib/leitner";

function labelForLevel(level: number) {
  const days = getIntervalDays(level);
  if (days === 1) return "Morgen (1 Tag)";
  return `In ${days} Tagen`;
}

function daysUntil(dateStr: string) {
  const today = new Date();
  const d = new Date(dateStr + "T00:00:00");
  const diffMs =
    d.getTime() -
    new Date(today.toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function addDaysYmd(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ownerKey = searchParams.get("ownerKey");
  const typeParam = searchParams.get("type");
  const resolvedType =
    typeParam === "sentence" ? "sentence" : typeParam === "vocab" ? "vocab" : null;

  if (!ownerKey) {
    return NextResponse.json({ error: "ownerKey is required" }, { status: 400 });
  }

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
    .map((r: any) => r.due_date as string)
    .filter(Boolean)
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
