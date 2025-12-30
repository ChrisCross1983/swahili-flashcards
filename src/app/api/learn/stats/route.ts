import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const LEVEL_DAYS = [0, 1, 3, 7, 14, 30, 60];

function labelForLevel(level: number) {
  const days = LEVEL_DAYS[level] ?? null;
  if (days === null) return `Level ${level}`;
  if (days === 0) return "Neu (0 Tage)";
  if (days === 1) return "Morgen (1 Tag)";
  return `In ${days} Tagen`;
}

function daysUntil(dateStr: string) {
  const today = new Date();
  const d = new Date(dateStr + "T00:00:00");
  const diffMs = d.getTime() - new Date(today.toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ownerKey = searchParams.get("ownerKey");

  if (!ownerKey) {
    return NextResponse.json({ error: "ownerKey is required" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data, error } = await supabaseServer
    .from("card_progress")
    .select("level, due_date")
    .eq("owner_key", ownerKey);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const total = rows.length;

  // counts by level
  const map = new Map<number, number>();
  for (const r of rows) {
    const lvl = Number(r.level ?? 0);
    map.set(lvl, (map.get(lvl) ?? 0) + 1);
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
    nextDueDate: futureDue,
    nextDueInDays: futureDue ? daysUntil(futureDue) : null,
  });
}
