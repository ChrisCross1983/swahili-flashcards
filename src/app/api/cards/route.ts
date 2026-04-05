import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { applyCardTypeFilter, getAllowedCardIdsByGroups, getCardGroups, parseGroupIds, resolveCardTypeFilter } from "@/lib/server/cardFilters";

type CreateCardBody = {
    german: string;
    swahili: string;
    imagePath?: string | null;
    type?: "vocab" | "sentence";
};

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const body = (await req.json()) as CreateCardBody;

    const ownerKey = user.id;
    const german = body.german?.trim();
    const swahili = body.swahili?.trim();
    const type = body.type === "sentence" ? "sentence" : "vocab";

    if (!german || !swahili) {
        return NextResponse.json(
            { error: "german and swahili are required" },
            { status: 400 }
        );
    }

    const { data: card, error } = await supabaseServer
        .from("cards")
        .insert({
            owner_key: ownerKey,
            german_text: german,
            swahili_text: swahili,
            image_path: body.imagePath ?? null,
            type,
        })
        .select("id, german_text, swahili_text, image_path, audio_path, created_at, type")
        .single();

    if (error) {
        if ((error as { code?: string }).code === "23505") {
            return NextResponse.json(
                { error: "Diese Karte existiert bereits." },
                { status: 409 }
            );
        }

        console.error(error);
        return NextResponse.json(
            { error: "Speichern fehlgeschlagen." },
            { status: 500 }
        );
    }

    const { error: progressError } = await supabaseServer
        .from("card_progress")
        .insert({
            card_id: card.id,
            owner_key: ownerKey,
            level: 0,
        });

    if (progressError) {
        console.error(progressError);
        return NextResponse.json(
            { error: "Speichern fehlgeschlagen." },
            { status: 500 }
        );
    }

    return NextResponse.json({ card });
}

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const ownerKey = user.id;
    const q = searchParams.get("q");
    const id = searchParams.get("id");
    const resolvedType = resolveCardTypeFilter(searchParams.get("type"));
    const groupIds = parseGroupIds(searchParams);
    const allowedCardIds = await getAllowedCardIdsByGroups(ownerKey, groupIds);

    if (allowedCardIds && allowedCardIds.length === 0) {
        if (id) return NextResponse.json({ card: null });
        return NextResponse.json({ cards: [] });
    }

    let query = supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, image_path, audio_path, created_at, type")
        .eq("owner_key", ownerKey);

    if (id) query = query.eq("id", id);

    query = applyCardTypeFilter(query, resolvedType);

    if (allowedCardIds) query = query.in("id", allowedCardIds);

    if (q && q.trim().length > 0) {
        query = query.or(`german_text.ilike.%${q}%,swahili_text.ilike.%${q}%`);
    }

    const { data, error } = id
        ? await query
        : await query.order("created_at", {
            ascending: false,
        });

    if (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Karten konnten nicht geladen werden." },
            { status: 500 }
        );
    }

    const cards = data ?? [];
    const groupsByCard = await getCardGroups(ownerKey, cards.map((card) => String(card.id)));

    if (id) {
        const card = cards[0] ? { ...cards[0], groups: groupsByCard.get(String(cards[0].id)) ?? [] } : null;
        return NextResponse.json({ card });
    }

    return NextResponse.json({
        cards: cards.map((card) => ({ ...card, groups: groupsByCard.get(String(card.id)) ?? [] })),
    });
}

export async function DELETE(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const ownerKey = user.id;
    const id = searchParams.get("id");
    if (id) {
        const { error } = await supabaseServer
            .from("cards")
            .delete()
            .eq("id", id)
            .eq("owner_key", ownerKey);

        if (error) {
            console.error(error);
            return NextResponse.json({ error: "Löschen fehlgeschlagen." }, { status: 500 });
        }

        return NextResponse.json({ ok: true, deletedIds: [id] });
    }

    const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
    const ids = Array.isArray(body.ids)
        ? body.ids.map((value) => String(value).trim()).filter(Boolean)
        : [];
    if (ids.length === 0) {
        return NextResponse.json({ error: "id or ids are required" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
        .from("cards")
        .delete()
        .eq("owner_key", ownerKey)
        .in("id", ids)
        .select("id");
    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Löschen fehlgeschlagen." }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        deletedCount: (data ?? []).length,
        deletedIds: (data ?? []).map((row) => String(row.id)),
    });
}

type UpdateCardBody = {
    id: string;
    german?: string;
    swahili?: string;
    imagePath?: string | null;
    type?: "vocab" | "sentence";
};

export async function PATCH(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const body = (await req.json()) as UpdateCardBody;
    const ownerKey = user.id;

    if (!body.id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, string | null> = {};
    if (typeof body.german === "string") updates.german_text = body.german.trim();
    if (typeof body.swahili === "string") updates.swahili_text = body.swahili.trim();
    if ("imagePath" in body) updates.image_path = body.imagePath ?? null;
    if (body.type === "vocab" || body.type === "sentence") updates.type = body.type;

    const { data, error } = await supabaseServer
        .from("cards")
        .update(updates)
        .eq("id", body.id)
        .eq("owner_key", ownerKey)
        .select()
        .single();

    if (error) {
        if ((error as { code?: string }).code === "23505") {
            return NextResponse.json(
                { error: "Diese Karte existiert bereits." },
                { status: 409 }
            );
        }

        console.error(error);
        return NextResponse.json(
            { error: "Aktualisieren fehlgeschlagen." },
            { status: 500 }
        );
    }

    return NextResponse.json({ card: data });
}
