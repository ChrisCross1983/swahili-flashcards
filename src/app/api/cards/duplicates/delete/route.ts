import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";

type DeleteDuplicatesBody = {
    cardIds?: string[];
};

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    let body: DeleteDuplicatesBody;
    try {
        body = (await req.json()) as DeleteDuplicatesBody;
    } catch {
        return NextResponse.json({ error: "Ungültiger Request." }, { status: 400 });
    }

    const cardIds = Array.from(new Set((body.cardIds ?? []).map((id) => String(id).trim()).filter(Boolean)));

    if (!cardIds.length) {
        return NextResponse.json({ error: "Keine Karten ausgewählt." }, { status: 400 });
    }

    const { data: ownedCards, error: ownershipError } = await supabaseServer
        .from("cards")
        .select("id")
        .eq("owner_key", user.id)
        .in("id", cardIds);

    if (ownershipError) {
        console.error(ownershipError);
        return NextResponse.json({ error: "Löschen fehlgeschlagen (Ownership)." }, { status: 500 });
    }

    const ownedIds = new Set((ownedCards ?? []).map((card) => String(card.id)));
    if (ownedIds.size !== cardIds.length) {
        return NextResponse.json({ error: "Einige Karten können nicht gelöscht werden." }, { status: 403 });
    }

    const tablesToClean = ["learn_last_missed", "card_groups", "card_progress", "ai_learner_state", "ai_card_mastery", "ai_card_enrichment"];

    for (const tableName of tablesToClean) {
        const { error } = await supabaseServer
            .from(tableName)
            .delete()
            .eq("owner_key", user.id)
            .in("card_id", cardIds);

        if (error) {
            console.error(tableName, error);
            return NextResponse.json({ error: `Löschen fehlgeschlagen (${tableName}).` }, { status: 500 });
        }
    }

    const { error: cardsError } = await supabaseServer
        .from("cards")
        .delete()
        .eq("owner_key", user.id)
        .in("id", cardIds);

    if (cardsError) {
        console.error(cardsError);
        return NextResponse.json({ error: "Löschen fehlgeschlagen." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deletedCount: cardIds.length });
}
