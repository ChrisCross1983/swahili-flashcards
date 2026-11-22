import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { withServerDiagnostics } from "@/lib/diagnostics/server";
import { isUuid } from "@/lib/diagnostics/validation";

type Body = {
    mode: "LEITNER" | "DRILL" | "ai";
    totalCount: number;
    correctCount: number;
    wrongCardIds: string[];
};

export const POST = withServerDiagnostics("/api/learn/sessions", async (req, diagnostics) => {
    let body: Body;

    try {
        body = (await req.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { user, response } = await requireUser();
    if (response) return response;
    diagnostics.setUser(user.id);
    diagnostics.setRunId(req.headers.get("x-diagnostics-run-id"));

    const ownerKey = user.id;
    const mode = body.mode;
    const totalCount = Number(body.totalCount ?? 0);
    const correctCount = Number(body.correctCount ?? 0);
    const wrongCardIds = Array.isArray(body.wrongCardIds)
        ? body.wrongCardIds.filter((id) => String(id).trim().length > 0)
        : [];
    const runId = req.headers.get("x-diagnostics-run-id");
    const diagnosticRunId = isUuid(runId) ? runId : null;

    if (!mode) {
        return NextResponse.json(
            { error: "mode is required" },
            { status: 400 }
        );
    }

    const row = {
        owner_key: ownerKey,
        mode,
        total_count: totalCount,
        correct_count: correctCount,
        wrong_card_ids: wrongCardIds,
    };
    let { error } = await supabaseServer.from("learn_sessions").insert({
        ...row,
        diagnostic_run_id: diagnosticRunId,
    });
    // Local development may still point at a database before the optional
    // idempotency migration; preserve the existing session-save path there.
    if (error && ["42703", "PGRST204"].includes(error.code ?? "")) {
        ({ error } = await supabaseServer.from("learn_sessions").insert(row));
    }

    if (error) {
        if (error.code === "23505" && diagnosticRunId) {
            const { data, error: lookupError } = await supabaseServer.from("learn_sessions")
                .select("diagnostic_run_id").eq("owner_key", ownerKey).eq("diagnostic_run_id", diagnosticRunId).maybeSingle();
            if (!lookupError && data) return NextResponse.json({ ok: true, alreadySaved: true });
        }
        diagnostics.supabaseFailure("learn_sessions", "insert", error.code);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
});
