import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseRunAction } from "@/lib/diagnostics/runs";
import { allowDiagnosticsRequest } from "@/lib/diagnostics/rateLimit";
import { readBoundedJson, sameOrigin } from "@/lib/diagnostics/validation";

export const runtime = "nodejs";

const json = (code: string, status: number) => NextResponse.json({ code }, { status });

export async function POST(request: Request) {
    const auth = await requireUser();
    if (auth.response) return auth.response;
    if (!sameOrigin(request)) return json("invalid_origin", 403);
    let input: unknown;
    try { input = await readBoundedJson(request); }
    catch (error) { return json(error instanceof Error && error.message === "too_large" ? "request_too_large" : "invalid_request", 400); }
    const action = parseRunAction(input);
    if (!action) return json("invalid_run_update", 400);
    if (!allowDiagnosticsRequest(auth.user.id, "runs")) return json("rate_limited", 429);

    if (action.action === "start") {
        const since = new Date(Date.now() - 3_600_000).toISOString();
        const { count, error: countError } = await supabaseServer.from("learning_run_health")
            .select("run_id", { count: "exact", head: true }).eq("user_id", auth.user.id).gte("started_at", since);
        if (countError || count === null) return json("diagnostics_unavailable", 503);
        if (count >= 120) return json("rate_limited", 429);
        const { error } = await supabaseServer.from("learning_run_health").insert({
            run_id: action.run_id, user_id: auth.user.id, mode: action.mode, run_kind: action.run_kind,
            status: "loading", build_version: action.build_version,
        });
        if (!error) return NextResponse.json({ applied: true });
        if (error.code !== "23505") return json(error.code === "23514" ? "invalid_run_update" : "diagnostics_unavailable", error.code === "23514" ? 400 : 503);
        const { data, error: lookupError } = await supabaseServer.from("learning_run_health")
            .select("run_id").eq("run_id", action.run_id).eq("user_id", auth.user.id).maybeSingle();
        if (lookupError) return json("diagnostics_unavailable", 503);
        return data ? NextResponse.json({ applied: false }) : json("run_id_unavailable", 409);
    }

    const now = new Date().toISOString();
    let query;
    if (action.action === "loaded") {
        query = supabaseServer.from("learning_run_health").update({
            status: "active", loaded_at: now, initial_card_count: action.initial_card_count,
            sequence_number: action.sequence_number, last_heartbeat_at: now, updated_at: now,
        }).eq("status", "loading");
    } else if (action.action === "heartbeat") {
        query = supabaseServer.from("learning_run_health").update({
            last_heartbeat_at: now, updated_at: now,
        }).eq("status", "active");
    } else {
        const changes = {
            last_position: action.last_position, correct_count: action.correct_count,
            wrong_count: action.wrong_count, sequence_number: action.sequence_number, updated_at: now,
            last_heartbeat_at: now,
        };
        if (action.action === "checkpoint") {
            query = supabaseServer.from("learning_run_health").update({
                ...changes, ...(action.grade_succeeded ? { last_successful_grade_at: now } : {}),
            }).eq("status", "active");
        } else {
            query = supabaseServer.from("learning_run_health").update({
                ...changes, status: action.status, end_reason: action.end_reason, ended_at: now,
                ...(action.grade_succeeded ? { last_successful_grade_at: now } : {}),
            }).in("status", ["loading", "active"]);
        }
        query = query.lte("last_position", action.last_position)
            .lte("correct_count", action.correct_count).lte("wrong_count", action.wrong_count);
    }
    const sequenced = action.action === "heartbeat"
        ? query.lte("sequence_number", action.sequence_number)
        : query.lt("sequence_number", action.sequence_number);
    const { data, error } = await sequenced.eq("run_id", action.run_id).eq("user_id", auth.user.id).select("run_id");
    if (error) return json(error.code === "23514" ? "invalid_run_update" : "diagnostics_unavailable", error.code === "23514" ? 400 : 503);
    if (data && data.length > 0) return NextResponse.json({ applied: true });

    // Distinguish a stale/idempotent update from a missing or foreign run without exposing ownership.
    const { data: existing, error: lookupError } = await supabaseServer.from("learning_run_health")
        .select("run_id").eq("run_id", action.run_id).eq("user_id", auth.user.id).maybeSingle();
    if (lookupError) return json("diagnostics_unavailable", 503);
    return existing ? NextResponse.json({ applied: false }) : json("run_not_found", 404);
}
