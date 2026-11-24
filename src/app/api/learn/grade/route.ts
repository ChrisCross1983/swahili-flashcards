import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { withServerDiagnostics } from "@/lib/diagnostics/server";
import { requireUserWithPerformance, ServerPerformanceAudit } from "@/lib/server/performanceAudit";

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
  cardId: string;
  correct: boolean;
  currentLevel?: number;
};

export const POST = withServerDiagnostics("/api/learn/grade", async (req, diagnostics) => {
  const audit = new ServerPerformanceAudit("/api/learn/grade");
  let body: Body;

  try {
    body = await audit.measure("body", async () => await req.json() as Body);
  } catch {
    return audit.response(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const { user, response } = await requireUserWithPerformance(audit, requireUser);
  if (response) return audit.response(response);
  diagnostics.setUser(user.id);
  diagnostics.setRunId(req.headers.get("x-diagnostics-run-id"));

  const ownerKey = user.id;
  const cardId = (body.cardId ?? "").trim();

  if (!cardId) {
    return audit.response(NextResponse.json(
      { error: "cardId is required" },
      { status: 400 }
    ));
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

  const { error } = await audit.measure("progress_upsert", async () => await supabaseServer
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
    .select());

  if (error) {
    diagnostics.supabaseFailure("card_progress", "upsert", error.code);
    console.error("[learn/grade] upsert error", { code: error.code ?? null });
    return audit.response(NextResponse.json(
      { error: "Update failed." },
      { status: 500 }
    ));
  }

  return audit.response(NextResponse.json({ ok: true, newLevel, dueDate }));
});
