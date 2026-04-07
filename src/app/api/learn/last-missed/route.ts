import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { applyCardTypeFilter, getAllowedCardIdsByGroups, getCardGroups, parseGroupIds, resolveCardTypeFilter } from "@/lib/server/cardFilters";

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const ownerKey = user.id;
    const resolvedType = resolveCardTypeFilter(searchParams.get("type"));
    const groupIds = parseGroupIds(searchParams);

    try {
        const { data: lastMissedRows, error: lastMissedError } = await supabaseServer
            .from("learn_last_missed")
            .select("card_id, created_at")
            .eq("owner_key", ownerKey)
            .order("created_at", { ascending: false });

        if (lastMissedError) {
            return NextResponse.json({ items: [], cards: [], error: lastMissedError.message });
        }

        const cardIds = (lastMissedRows ?? []).map((row) => String(row.card_id ?? "")).filter(Boolean);
        if (cardIds.length === 0) return NextResponse.json({ items: [], cards: [] });

        const allowedCardIds = await getAllowedCardIdsByGroups(ownerKey, groupIds, resolvedType);
        if (allowedCardIds && allowedCardIds.length === 0) return NextResponse.json({ items: [], cards: [] });

        let cardsQuery = supabaseServer
            .from("cards")
            .select("id, german_text, swahili_text, image_path, audio_path, type")
            .eq("owner_key", ownerKey)
            .in("id", cardIds);

        cardsQuery = applyCardTypeFilter(cardsQuery, resolvedType);
        if (allowedCardIds) cardsQuery = cardsQuery.in("id", allowedCardIds);

        const { data: cards, error: cardsError } = await cardsQuery;

        if (cardsError) {
            return NextResponse.json({ items: [], cards: [], error: cardsError.message });
        }

        const groupsByCard = await getCardGroups(ownerKey, (cards ?? []).map((card) => String(card.id)), resolvedType);
        const cardMap = new Map((cards ?? []).map((card) => [String(card.id), { ...card, groups: groupsByCard.get(String(card.id)) ?? [] }]));
        const orderedCards = cardIds.map((id) => cardMap.get(String(id))).filter(Boolean);

        return NextResponse.json({ items: orderedCards, cards: orderedCards });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? "Unbekannter Fehler" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { user, response } = await requireUser();
        if (response) return response;

        const body = await req.json();
        const ownerKey = user.id;
        const cardId = String(body?.cardId ?? "").trim();
        const action = String(body?.action ?? "").trim();

        if (!cardId) {
            return NextResponse.json({ error: "cardId ist erforderlich." }, { status: 400 });
        }

        if (action === "add") {
            const { error } = await supabaseServer
                .from("learn_last_missed")
                .upsert({ owner_key: ownerKey, card_id: cardId }, { onConflict: "owner_key,card_id" });

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true });
        }

        if (action === "remove") {
            const { error } = await supabaseServer
                .from("learn_last_missed")
                .delete()
                .eq("owner_key", ownerKey)
                .eq("card_id", cardId);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: "Ungültige Aktion." }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? "Unbekannter Fehler" }, { status: 500 });
    }
}
