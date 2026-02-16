import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { assertOwnerKeyMatchesUser, requireUser } from "@/lib/api/auth";

type CardTypeFilter = "all" | "vocab" | "sentence";

const MISSING_TABLE_CODES = new Set(["42P01"]);

function isMissingTableError(error: { code?: string; message?: string } | null) {
    if (!error) return false;
    if (error.code && MISSING_TABLE_CODES.has(error.code)) return true;
    return error.message?.toLowerCase().includes("does not exist") ?? false;
}

function toYmd(date: Date) {
    return date.toISOString().slice(0, 10);
}

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

function getLast7Days() {
    const days: string[] = [];
    const today = new Date();

    for (let i = 6; i >= 0; i -= 1) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        days.push(toYmd(date));
    }

    return days;
}

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const ownerKey = searchParams.get("ownerKey");
    const typeFilter = getTypeFilter(searchParams.get("type"));

    const denied = assertOwnerKeyMatchesUser(ownerKey, user.id);
    if (denied) return denied;

    const last7d = getLast7Days();
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

    const todayQuery = supabaseServer
        .from("learn_sessions")
        .select("total_count, correct_count, wrong_card_ids, created_at")
        .eq("owner_key", ownerKey)
        .gte("created_at", `${endDate}T00:00:00.000Z`)
        .lt("created_at", `${endDate}T23:59:59.999Z`)
        .order("created_at", { ascending: true });

    const sessions7dQuery = supabaseServer
        .from("learn_sessions")
        .select("total_count, correct_count, wrong_card_ids, created_at")
        .eq("owner_key", ownerKey)
        .gte("created_at", `${startDate}T00:00:00.000Z`)
        .lte("created_at", `${endDate}T23:59:59.999Z`)
        .order("created_at", { ascending: true });

    const [cardsResult, progressResult, todayResult, sessions7dResult] = await Promise.all([
        cardsQuery,
        progressQuery,
        todayQuery,
        sessions7dQuery,
    ]);

    if (cardsResult.error) {
        return NextResponse.json({ error: cardsResult.error.message }, { status: 500 });
    }

    if (progressResult.error) {
        return NextResponse.json({ error: progressResult.error.message }, { status: 500 });
    }

    const sessionsMissing = isMissingTableError(todayResult.error) || isMissingTableError(sessions7dResult.error);

    if (!sessionsMissing && todayResult.error) {
        return NextResponse.json({ error: todayResult.error.message }, { status: 500 });
    }

    if (!sessionsMissing && sessions7dResult.error) {
        return NextResponse.json({ error: sessions7dResult.error.message }, { status: 500 });
    }

    const cardRows = cardsResult.data ?? [];
    const progressRows = progressResult.data ?? [];
    const todayRows = sessionsMissing ? [] : (todayResult.data ?? []);
    const sessionRows = sessionsMissing ? [] : (sessions7dResult.data ?? []);

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

    const byLevel: Record<string, number> = {
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
    };

    for (const row of progressRows as Array<{ level: number | null; cards: Array<{ type: string | null }> }>) {
        const cardType = row.cards?.[0]?.type;
        if (!matchesType(cardType, typeFilter)) continue;

        const levelNumber = Math.max(1, Math.min(6, Number(row.level ?? 1)));
        byLevel[String(levelNumber)] += 1;
    }

    let todayReviewed = 0;
    let todayCorrect = 0;
    let todayWrong = 0;

    for (const row of todayRows as Array<{ total_count: number | null; correct_count: number | null; wrong_card_ids: string[] | null }>) {
        const total = Number(row.total_count ?? 0);
        const correct = Number(row.correct_count ?? 0);
        const wrongIds = Array.isArray(row.wrong_card_ids) ? row.wrong_card_ids.length : Math.max(total - correct, 0);

        todayReviewed += total;
        todayCorrect += correct;
        todayWrong += wrongIds;
    }

    const last7dMap = new Map<string, { date: string; sessions: number; reviewed: number; correct: number; wrong: number }>();

    for (const date of last7d) {
        last7dMap.set(date, { date, sessions: 0, reviewed: 0, correct: 0, wrong: 0 });
    }

    let totalSessions = 0;
    let totalReviewed = 0;
    let totalCorrect = 0;
    let totalWrong = 0;

    for (const row of sessionRows as Array<{ total_count: number | null; correct_count: number | null; wrong_card_ids: string[] | null; created_at: string }>) {
        const date = String(row.created_at).slice(0, 10);
        const bucket = last7dMap.get(date);
        if (!bucket) continue;

        const reviewed = Number(row.total_count ?? 0);
        const correct = Number(row.correct_count ?? 0);
        const wrong = Array.isArray(row.wrong_card_ids) ? row.wrong_card_ids.length : Math.max(reviewed - correct, 0);

        bucket.sessions += 1;
        bucket.reviewed += reviewed;
        bucket.correct += correct;
        bucket.wrong += wrong;

        totalSessions += 1;
        totalReviewed += reviewed;
        totalCorrect += correct;
        totalWrong += wrong;
    }

    const filteredTotals =
        typeFilter === "sentence"
            ? { all: totals.sentence, vocab: 0, sentence: totals.sentence }
            : typeFilter === "vocab"
                ? { all: totals.vocab, vocab: totals.vocab, sentence: 0 }
                : totals;

    const averages = {
        accuracy: totalReviewed > 0 ? totalCorrect / totalReviewed : 0,
        avgWrongPerSession: totalSessions > 0 ? totalWrong / totalSessions : 0,
        avgCardsPerSession: totalSessions > 0 ? totalReviewed / totalSessions : 0,
    };

    return NextResponse.json({
        totals: filteredTotals,
        byLevel,
        today: {
            reviewed: todayReviewed,
            correct: todayCorrect,
            wrong: todayWrong,
        },
        last7d: last7d.map((date) => last7dMap.get(date)!),
        averages,
    });
}
