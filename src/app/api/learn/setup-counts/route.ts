import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { withServerDiagnostics } from "@/lib/diagnostics/server";
import { applyCardTypeFilter, getAllowedCardIdsByGroups, parseGroupIds, resolveCardTypeFilter } from "@/lib/server/cardFilters";
import { requireUserWithPerformance, ServerPerformanceAudit } from "@/lib/server/performanceAudit";
import { getTrainerSetupCountsForUser, TrainerSetupCountsRpcError } from "@/lib/server/trainerSetupCounts";

const MISSING_TABLE_CODES = new Set(["42P01"]);

function isMissingTableError(error: { code?: string; message?: string } | null) {
    if (!error) return false;
    if (error.code && MISSING_TABLE_CODES.has(error.code)) return true;
    return error.message?.toLowerCase().includes("does not exist") ?? false;
}

class CountQueryError extends Error {
    constructor(readonly table: string, readonly code: string | undefined, message: string) { super(message); }
}

type CountQuery = {
    eq: (column: string, value: string) => CountQuery;
    lte: (column: string, value: string) => CountQuery;
    or: (filters: string, options?: { foreignTable?: string }) => CountQuery;
    in: (column: string, values: string[]) => CountQuery;
};

type CountResult = { count: number | null; error: { code?: string; message: string } | null };
type RpcFallbackReason = "rpc_not_found_or_signature_mismatch" | "rpc_permission_denied" | "rpc_other_error";
function classifyRpcFallback(error?: TrainerSetupCountsRpcError | null): RpcFallbackReason {
    if (error?.code === "PGRST202" || error?.code === "PGRST203" || error?.code === "42883") {
        // PGRST202 explicitly covers a missing function as well as a stale
        // function signature, so do not pretend that the two are distinguishable
        // without logging the raw database message.
        return "rpc_not_found_or_signature_mismatch";
    }
    if (error?.code === "42501" || error?.status === 401 || error?.status === 403) return "rpc_permission_denied";
    return "rpc_other_error";
}

function logRpcFallback(reason: RpcFallbackReason) {
    if (process.env.PERFORMANCE_AUDIT !== "1") return;
    // Intentionally log only a fixed category: never user input, IDs or the
    // raw PostgREST/database error.
    console.info("[performance-audit]", {
        scope: "/api/learn/setup-counts",
        rpc_fallback_reason: reason,
    });
}

async function safeCount(table: string, applyFilters?: (q: CountQuery) => CountQuery, select = "*") {
    let q = supabaseServer.from(table).select(select, { count: "exact", head: true }) as unknown as CountQuery;
    if (applyFilters) q = applyFilters(q);

    const { count, error } = await (q as unknown as Promise<CountResult>);
    if (error) {
        if (isMissingTableError(error)) return 0;
        throw new CountQueryError(table, error.code, error.message);
    }
    return count ?? 0;
}

export const GET = withServerDiagnostics("/api/learn/setup-counts", async (req, diagnostics) => {
    const audit = new ServerPerformanceAudit("/api/learn/setup-counts");
    const { user, response } = await requireUserWithPerformance(audit, requireUser);
    if (response) return audit.response(response);
    diagnostics.setUser(user.id);

    const { searchParams } = new URL(req.url);
    const ownerKey = user.id;
    const resolvedType = resolveCardTypeFilter(searchParams.get("type"));
    const today = new Date().toISOString().slice(0, 10);
    const groupIds = parseGroupIds(searchParams);
    let rpcFallback = false;

    if (groupIds.length === 0) {
        const rpcStartedAt = performance.now();
        try {
            const counts = await getTrainerSetupCountsForUser(ownerKey, resolvedType, today);
            audit.mark("counts_rpc", rpcStartedAt);
            return audit.response(NextResponse.json(counts), { countStrategyRpc: 1 });
        } catch (error) {
            const rpcError = error instanceof TrainerSetupCountsRpcError ? error : null;
            // Keep the dashboard available if PostgREST has not loaded the
            // migration yet, or the RPC has a transient failure.
            audit.mark("counts_rpc_fallback", rpcStartedAt);
            logRpcFallback(classifyRpcFallback(rpcError));
            rpcFallback = true;
        }
    }

    const allowedCardIds = await audit.measure("groups", () => getAllowedCardIdsByGroups(ownerKey, groupIds, resolvedType));

    if (allowedCardIds && allowedCardIds.length === 0) {
        return audit.response(NextResponse.json({ todayDue: 0, totalCards: 0, lastMissedCount: 0 }), { groupFilterIds: 0 });
    }

    try {
        const [todayDue, totalCards, lastMissedCount] = await Promise.all([
            audit.measure("due", () => safeCount(
                "card_progress",
                (q) => {
                    let query = q.eq("owner_key", ownerKey).lte("due_date", today);
                    query = applyCardTypeFilter(query, resolvedType, { foreignTable: "cards" });
                    if (allowedCardIds) query = query.in("card_id", allowedCardIds);
                    return query;
                },
                "card_id, cards!inner(type)"
            )),
            audit.measure("cards", () => safeCount("cards", (q) => {
                let query = q.eq("owner_key", ownerKey);
                query = applyCardTypeFilter(query, resolvedType);
                if (allowedCardIds) query = query.in("id", allowedCardIds);
                return query;
            })),
            audit.measure("last_missed", () => safeCount(
                "learn_last_missed",
                (q) => {
                    let query = q.eq("owner_key", ownerKey);
                    query = applyCardTypeFilter(query, resolvedType, { foreignTable: "cards" });
                    if (allowedCardIds) query = query.in("card_id", allowedCardIds);
                    return query;
                },
                "card_id, cards!inner(type)"
            )),
        ]);

        return audit.response(NextResponse.json({ todayDue, totalCards, lastMissedCount }), {
            groupFilterIds: allowedCardIds?.length ?? 0,
            countStrategyRpcFallback: rpcFallback ? 1 : 0,
        });
    } catch (error) {
        if (error instanceof CountQueryError) diagnostics.supabaseFailure(error.table, "select", error.code);
        const message = error instanceof Error ? error.message : "Unknown error";
        return audit.response(NextResponse.json({ error: message }, { status: 500 }));
    }
});
