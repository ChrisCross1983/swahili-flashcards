import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { withServerDiagnostics } from "@/lib/diagnostics/server";
import { applyCardTypeFilter, getCardGroups, resolveCardTypeFilter } from "@/lib/server/cardFilters";
import { requireUserWithPerformance, ServerPerformanceAudit } from "@/lib/server/performanceAudit";

type CardRecord = {
    id: string;
    german_text: string;
    swahili_text: string;
    german_example?: string | null;
    swahili_example?: string | null;
    image_path?: string | null;
    audio_path?: string | null;
    sentence_explanation?: unknown;
    type?: string | null;
};

type DueRow = {
    card_id: string;
    level: number;
    due_date: string | null;
    cards: CardRecord | CardRecord[];
};

function unwrapCard(cards: CardRecord | CardRecord[]): CardRecord | null {
    return Array.isArray(cards) ? cards[0] ?? null : cards;
}

function toItem(card: CardRecord, groups: Array<{ id: string; name: string; color: string | null }>, due?: Pick<DueRow, "level" | "due_date">) {
    return {
        cardId: card.id,
        level: due?.level ?? 0,
        dueDate: due?.due_date ?? null,
        german: card.german_text,
        swahili: card.swahili_text,
        german_example: card.german_example ?? null,
        swahili_example: card.swahili_example ?? null,
        imagePath: card.image_path ?? null,
        audio_path: card.audio_path ?? null,
        type: card.type ?? null,
        sentence_explanation: card.sentence_explanation ?? null,
        groups,
    };
}

export const GET = withServerDiagnostics("/api/learn/quick-start", async (req, diagnostics) => {
    const audit = new ServerPerformanceAudit("/api/learn/quick-start");
    const { user, response } = await requireUserWithPerformance(audit, requireUser);
    if (response) return audit.response(response);
    diagnostics.setUser(user.id);

    const { searchParams } = new URL(req.url);
    const resolvedType = resolveCardTypeFilter(searchParams.get("type"));
    const today = new Date().toISOString().slice(0, 10);

    let dueQuery = supabaseServer
        .from("card_progress")
        .select("card_id, level, due_date, cards!inner(id, german_text, swahili_text, german_example, swahili_example, image_path, audio_path, sentence_explanation, type)")
        .eq("owner_key", user.id)
        .eq("cards.owner_key", user.id)
        .lte("due_date", today)
        .order("due_date", { ascending: true });
    dueQuery = applyCardTypeFilter(dueQuery, resolvedType, { foreignTable: "cards" });
    const { data: dueRows, error: dueError } = await audit.measure("due_cards_query", async () => await dueQuery);
    if (dueError) return audit.response(NextResponse.json({ error: dueError.message }, { status: 500 }));

    const due = (dueRows ?? []) as DueRow[];
    if (due.length > 0) {
        const groupsByCard = await audit.measure("groups_enrichment", () => getCardGroups(user.id, due.map((row) => String(row.card_id)), resolvedType));
        const items = due.flatMap((row) => {
            const card = unwrapCard(row.cards);
            return card ? [toItem(card, groupsByCard.get(String(row.card_id)) ?? [], row)] : [];
        });
        return audit.response(NextResponse.json({ kind: "today", items }), { itemCount: items.length });
    }

    const { data: missedRows, error: missedError } = await audit.measure("last_missed_query", async () => await supabaseServer
        .from("learn_last_missed")
        .select("card_id")
        .eq("owner_key", user.id)
        .order("created_at", { ascending: false }));
    if (missedError) return audit.response(NextResponse.json({ error: missedError.message }, { status: 500 }));

    const missedIds = (missedRows ?? []).map((row) => String(row.card_id ?? "")).filter(Boolean);
    if (missedIds.length > 0) {
        let missedCardsQuery = supabaseServer
            .from("cards")
            .select("id, german_text, swahili_text, german_example, swahili_example, image_path, audio_path, sentence_explanation, type")
            .eq("owner_key", user.id)
            .in("id", missedIds);
        missedCardsQuery = applyCardTypeFilter(missedCardsQuery, resolvedType);
        const { data: missedCards, error: missedCardsError } = await audit.measure("last_missed_cards_query", async () => await missedCardsQuery);
        if (missedCardsError) return audit.response(NextResponse.json({ error: missedCardsError.message }, { status: 500 }));

        const cardsById = new Map((missedCards ?? []).map((card) => [String(card.id), card as CardRecord]));
        const orderedCards = missedIds.flatMap((id) => {
            const card = cardsById.get(id);
            return card ? [card] : [];
        });
        if (orderedCards.length > 0) {
            const groupsByCard = await audit.measure("groups_enrichment", () => getCardGroups(user.id, orderedCards.map((card) => card.id), resolvedType));
            const items = orderedCards.map((card) => toItem(card, groupsByCard.get(card.id) ?? []));
            return audit.response(NextResponse.json({ kind: "last-missed", items }), { itemCount: items.length });
        }
    }

    let allCardsQuery = supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, german_example, swahili_example, image_path, audio_path, sentence_explanation, type")
        .eq("owner_key", user.id);
    allCardsQuery = applyCardTypeFilter(allCardsQuery, resolvedType);
    const { data: allCards, error: allCardsError } = await audit.measure("all_cards_query", async () => await allCardsQuery);
    if (allCardsError) return audit.response(NextResponse.json({ error: allCardsError.message }, { status: 500 }));

    const cards = (allCards ?? []) as CardRecord[];
    const groupsByCard = await audit.measure("groups_enrichment", () => getCardGroups(user.id, cards.map((card) => card.id), resolvedType));
    const items = cards.map((card) => toItem(card, groupsByCard.get(card.id) ?? []));
    return audit.response(NextResponse.json({ kind: "all", items }), { itemCount: items.length });
});
