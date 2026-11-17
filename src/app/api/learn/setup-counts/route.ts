import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { withServerDiagnostics } from "@/lib/diagnostics/server";
import { applyCardTypeFilter, getAllowedCardIdsByGroups, parseGroupIds, resolveCardTypeFilter } from "@/lib/server/cardFilters";

const MISSING_TABLE_CODES = new Set(["42P01"]);

function isMissingTableError(error: { code?: string; message?: string } | null) {
    if (!error) return false;
    if (error.code && MISSING_TABLE_CODES.has(error.code)) return true;
    return error.message?.toLowerCase().includes("does not exist") ?? false;
}

class CountQueryError extends Error {
    constructor(readonly table: string, readonly code: string | undefined, message: string) { super(message); }
}

async function safeCount(table: string, applyFilters?: (q: any) => any, select = "*") {
    let q = supabaseServer.from(table).select(select, { count: "exact", head: true });
    if (applyFilters) q = applyFilters(q);

    const { count, error } = await q;
    if (error) {
        if (isMissingTableError(error)) return 0;
        throw new CountQueryError(table, error.code, error.message);
    }
    return count ?? 0;
}

export const GET = withServerDiagnostics("/api/learn/setup-counts", async (req, diagnostics) => {
    const { user, response } = await requireUser();
    if (response) return response;
    diagnostics.setUser(user.id);

    const { searchParams } = new URL(req.url);
    const ownerKey = user.id;
    const resolvedType = resolveCardTypeFilter(searchParams.get("type"));
    const groupIds = parseGroupIds(searchParams);
    const allowedCardIds = await getAllowedCardIdsByGroups(ownerKey, groupIds, resolvedType);
    const today = new Date().toISOString().slice(0, 10);

    if (allowedCardIds && allowedCardIds.length === 0) {
        return NextResponse.json({ todayDue: 0, totalCards: 0, lastMissedCount: 0 });
    }

    try {
        const [todayDue, totalCards, lastMissedCount] = await Promise.all([
            safeCount(
                "card_progress",
                (q) => {
                    let query = q.eq("owner_key", ownerKey).lte("due_date", today);
                    query = applyCardTypeFilter(query, resolvedType, { foreignTable: "cards" });
                    if (allowedCardIds) query = query.in("card_id", allowedCardIds);
                    return query;
                },
                "card_id, cards!inner(type)"
            ),
            safeCount("cards", (q) => {
                let query = q.eq("owner_key", ownerKey);
                query = applyCardTypeFilter(query, resolvedType);
                if (allowedCardIds) query = query.in("id", allowedCardIds);
                return query;
            }),
            safeCount(
                "learn_last_missed",
                (q) => {
                    let query = q.eq("owner_key", ownerKey);
                    query = applyCardTypeFilter(query, resolvedType, { foreignTable: "cards" });
                    if (allowedCardIds) query = query.in("card_id", allowedCardIds);
                    return query;
                },
                "card_id, cards!inner(type)"
            ),
        ]);

        return NextResponse.json({ todayDue, totalCards, lastMissedCount });
    } catch (error) {
        if (error instanceof CountQueryError) diagnostics.supabaseFailure(error.table, "select", error.code);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
});
