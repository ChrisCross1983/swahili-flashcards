// api/learn/setup-counts/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const MISSING_TABLE_CODES = new Set(["42P01"]);

function isMissingTableError(error: { code?: string; message?: string } | null) {
    if (!error) return false;
    if (error.code && MISSING_TABLE_CODES.has(error.code)) return true;
    return error.message?.toLowerCase().includes("does not exist") ?? false;
}

async function safeCount(
    table: string,
    applyFilters?: (q: any) => any
) {
    let q = supabaseServer
        .from(table)
        .select("*", { count: "exact", head: true });

    if (applyFilters) q = applyFilters(q);

    const { count, error } = await q;

    if (error) {
        if (isMissingTableError(error)) return 0;
        throw new Error(error.message);
    }

    return count ?? 0;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const ownerKey = searchParams.get("ownerKey");

    if (!ownerKey) {
        return NextResponse.json({ error: "ownerKey is required" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);

    try {
        const [todayDue, totalCards, lastMissedCount] = await Promise.all([
            safeCount("card_progress", (q) =>
                q.eq("owner_key", ownerKey).lte("due_date", today)
            ),
            safeCount("cards", (q) => q.eq("owner_key", ownerKey)),
            safeCount("learn_last_missed", (q) => q.eq("owner_key", ownerKey)),
        ]);

        return NextResponse.json({ todayDue, totalCards, lastMissedCount });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
