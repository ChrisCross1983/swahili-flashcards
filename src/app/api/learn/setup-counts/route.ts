import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";

const MISSING_TABLE_CODES = new Set(["42P01"]);

function isMissingTableError(error: { code?: string; message?: string } | null) {
    if (!error) return false;
    if (error.code && MISSING_TABLE_CODES.has(error.code)) return true;
    return error.message?.toLowerCase().includes("does not exist") ?? false;
}

async function safeCount(
    table: string,
    applyFilters?: (q: any) => any,
    select = "*"
) {
    let q = supabaseServer
        .from(table)
        .select(select, { count: "exact", head: true });

    if (applyFilters) q = applyFilters(q);

    const { count, error } = await q;

    if (error) {
        if (isMissingTableError(error)) return 0;
        throw new Error(error.message);
    }

    return count ?? 0;
}

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const ownerKey = user.id;
    const typeParam = searchParams.get("type");
    const resolvedType =
        typeParam === "sentence" ? "sentence" : typeParam === "vocab" ? "vocab" : null;

    const today = new Date().toISOString().slice(0, 10);

    try {
        const [todayDue, totalCards, lastMissedCount] = await Promise.all([
            safeCount(
                "card_progress",
                (q) => {
                    let query = q.eq("owner_key", ownerKey).lte("due_date", today);
                    if (resolvedType === "sentence") {
                        query = query.eq("cards.type", "sentence");
                    } else if (resolvedType === "vocab") {
                        query = query.or("type.is.null,type.eq.vocab", {
                            foreignTable: "cards",
                        });
                    }
                    return query;
                },
                "card_id, cards!inner(type)"
            ),
            safeCount("cards", (q) => {
                let query = q.eq("owner_key", ownerKey);
                if (resolvedType === "sentence") {
                    query = query.eq("type", "sentence");
                } else if (resolvedType === "vocab") {
                    query = query.or("type.is.null,type.eq.vocab");
                }
                return query;
            }),
            safeCount(
                "learn_last_missed",
                (q) => {
                    let query = q.eq("owner_key", ownerKey);
                    if (resolvedType === "sentence") {
                        query = query.eq("cards.type", "sentence");
                    } else if (resolvedType === "vocab") {
                        query = query.or("type.is.null,type.eq.vocab", {
                            foreignTable: "cards",
                        });
                    }
                    return query;
                },
                "card_id, cards!inner(type)"
            ),
        ]);

        return NextResponse.json({ todayDue, totalCards, lastMissedCount });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
