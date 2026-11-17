import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { allowDiagnosticsRequest } from "@/lib/diagnostics/rateLimit";
import { parseEvents, readBoundedJson, sameOrigin } from "@/lib/diagnostics/validation";

export const runtime = "nodejs";

const json = (code: string, status: number) => NextResponse.json({ code }, { status });

export async function POST(request: Request) {
    const auth = await requireUser();
    if (auth.response) return auth.response;
    if (!sameOrigin(request)) return json("invalid_origin", 403);

    let input: unknown;
    try { input = await readBoundedJson(request); }
    catch (error) { return json(error instanceof Error && error.message === "too_large" ? "request_too_large" : "invalid_request", 400); }
    const events = parseEvents(input, auth.user.id);
    if (!events) return json("invalid_events", 400);
    if (!allowDiagnosticsRequest(auth.user.id)) return json("rate_limited", 429);

    // created_at is server-generated; a backdated occurred_at cannot evade this quota.
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count, error: countError } = await supabaseServer.from("app_diagnostic_events")
        .select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).gte("created_at", since);
    if (countError || count === null) return json("diagnostics_unavailable", 503);
    if (count + events.length > 120) return json("rate_limited", 429);

    // ON CONFLICT DO NOTHING gives retries a stable event identity without replacing old rows.
    const { error } = await supabaseServer.from("app_diagnostic_events")
        .upsert(events, { onConflict: "id", ignoreDuplicates: true });
    if (error) return json("diagnostics_unavailable", 503);
    return NextResponse.json({ accepted: events.length });
}
