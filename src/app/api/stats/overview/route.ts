import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { countLevels, last7UtcDays, summarizeSessions, type SessionRow } from "@/lib/stats/overview";

type CardTypeFilter = "all" | "vocab" | "sentence";

function getTypeFilter(typeParam: string | null): CardTypeFilter {
    if (typeParam === "vocab") return "vocab";
    if (typeParam === "sentence") return "sentence";
    return "all";
}

function matchesType(type: string | null | undefined, filter: CardTypeFilter) {
    if (filter === "all") return true;
    if (filter === "sentence") return type === "sentence";
    return type == null || type === "vocab";
}

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const ownerKey = user.id;
    const typeFilter = getTypeFilter(searchParams.get("type"));

    const last7d = last7UtcDays(new Date());
    const startDate = last7d[0];
    const endDate = last7d[last7d.length - 1];

    const cardsQuery = supabaseServer
        .from("cards")
        .select("id, type")
        .eq("owner_key", ownerKey);

    const progressQuery = supabaseServer
        .from("card_progress")
        .select("level, cards!inner(type)")
        .eq("owner_key", ownerKey);

    const sessions7dQuery = supabaseServer
        .from("learn_sessions")
        .select("total_count, correct_count, wrong_card_ids, created_at")
        .eq("owner_key", ownerKey)
        .gte("created_at", `${startDate}T00:00:00.000Z`)
        .lt("created_at", new Date(Date.parse(`${endDate}T00:00:00.000Z`) + 86_400_000).toISOString())
        .order("created_at", { ascending: true });

    const [cardsResult, progressResult, sessions7dResult] = await Promise.all([
        cardsQuery,
        progressQuery,
        sessions7dQuery,
    ]);

    if (cardsResult.error) {
        return NextResponse.json({ error: cardsResult.error.message }, { status: 500 });
    }

    if (progressResult.error) {
        return NextResponse.json({ error: progressResult.error.message }, { status: 500 });
    }

    if (sessions7dResult.error) {
        return NextResponse.json({ error: sessions7dResult.error.message }, { status: 500 });
    }

    const cardRows = cardsResult.data ?? [];
    const progressRows = progressResult.data ?? [];
    const sessionRows = sessions7dResult.data ?? [];

    const totals = {
        all: 0,
        vocab: 0,
        sentence: 0,
    };

    for (const row of cardRows) {
        const type = row.type as string | null;
        if (type === "sentence") {
            totals.sentence += 1;
            totals.all += 1;
            continue;
        }

        totals.vocab += 1;
        totals.all += 1;
    }

    const levels: number[] = [];
    for (const row of progressRows as Array<{ level: number | null; cards: Array<{ type: string | null }> }>) {
        const cardType = Array.isArray(row.cards) ? row.cards[0]?.type : (row.cards as unknown as { type: string | null } | null)?.type;
        if (!matchesType(cardType, typeFilter)) continue;
        levels.push(Number(row.level ?? 0));
    }
    const byLevel = countLevels(levels);

    const filteredTotals =
        typeFilter === "sentence"
            ? { all: totals.sentence, vocab: 0, sentence: totals.sentence }
            : typeFilter === "vocab"
                ? { all: totals.vocab, vocab: totals.vocab, sentence: 0 }
                : totals;

    // Aggregate sessions have no card type or reviewed card IDs. Typed session metrics cannot be recovered.
    const sessionStatsAvailable = typeFilter === "all";
    const summary = summarizeSessions(sessionStatsAvailable ? sessionRows as SessionRow[] : [], last7d);

    return NextResponse.json({
        totals: filteredTotals,
        byLevel,
        sessionStatsAvailable,
        ...summary,
    });
}
