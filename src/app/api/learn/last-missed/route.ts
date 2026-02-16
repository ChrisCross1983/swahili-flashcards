import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const ownerKey = user.id;
    const typeParam = searchParams.get("type");
    const resolvedType =
        typeParam === "sentence" ? "sentence" : typeParam === "vocab" ? "vocab" : null;

    try {
        const { data: lastMissedRows, error: lastMissedError } = await supabaseServer
            .from("learn_last_missed")
            .select("card_id, created_at")
            .eq("owner_key", ownerKey)
            .order("created_at", { ascending: false });

        if (lastMissedError) {
            console.error("last-missed query error", {
                message: lastMissedError.message,
                details: lastMissedError.details,
                hint: lastMissedError.hint,
                code: lastMissedError.code,
            });
            return NextResponse.json({
                items: [],
                cards: [],
                error: lastMissedError.message,
            });
        }

        const cardIds = (lastMissedRows ?? [])
            .map((row) => String(row.card_id ?? "").trim())
            .filter(Boolean);

        if (cardIds.length === 0) {
            return NextResponse.json({ items: [], cards: [] });
        }

        let cardsQuery = supabaseServer
            .from("cards")
            .select("id, german_text, swahili_text, image_path, audio_path")
            .eq("owner_key", ownerKey)
            .in("id", cardIds);

        if (resolvedType === "sentence") {
            cardsQuery = cardsQuery.eq("type", "sentence");
        } else if (resolvedType === "vocab") {
            cardsQuery = cardsQuery.or("type.is.null,type.eq.vocab");
        }

        const { data: cards, error: cardsError } = await cardsQuery;

        if (cardsError) {
            console.error("last-missed cards lookup error", {
                message: cardsError.message,
                details: cardsError.details,
                hint: cardsError.hint,
                code: cardsError.code,
            });
            return NextResponse.json({
                items: [],
                cards: [],
                error: cardsError.message,
            });
        }

        const cardMap = new Map((cards ?? []).map((card) => [String(card.id), card]));
        const orderedCards = cardIds
            .map((id) => cardMap.get(String(id)))
            .filter(Boolean);

        return NextResponse.json({ items: orderedCards, cards: orderedCards });
    } catch (err: any) {
        console.error("last-missed route error", err);
        return NextResponse.json(
            { error: err?.message ?? "Unbekannter Fehler" },
            { status: 500 }
        );
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
            return NextResponse.json(
                { error: "cardId ist erforderlich." },
                { status: 400 }
            );
        }

        if (action === "add") {
            const { error } = await supabaseServer
                .from("learn_last_missed")
                .upsert(
                    { owner_key: ownerKey, card_id: cardId },
                    { onConflict: "owner_key,card_id" }
                );

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ ok: true });
        }

        if (action === "remove") {
            const { error } = await supabaseServer
                .from("learn_last_missed")
                .delete()
                .eq("owner_key", ownerKey)
                .eq("card_id", cardId);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ ok: true });
        }

        return NextResponse.json(
            { error: "Ungültige Aktion." },
            { status: 400 }
        );
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message ?? "Unbekannter Fehler" },
            { status: 500 }
        );
    }
}
