import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id: groupId } = await params;
    const body = await req.json().catch(() => ({}));
    const resolvedType = body?.type === "sentence" ? "sentence" : "vocab";
    const cardIds: string[] = Array.isArray(body?.cardIds)
        ? Array.from(new Set(body.cardIds.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)))
        : [];

    if (cardIds.length === 0) {
        return NextResponse.json({ error: "cardIds is required" }, { status: 400 });
    }

    let groupQuery = supabaseServer
        .from("groups")
        .select("id, type_scope")
        .eq("id", groupId)
        .eq("owner_key", user.id);

    if (resolvedType === "sentence") {
        groupQuery = groupQuery.eq("type_scope", "sentence");
    } else {
        groupQuery = groupQuery.or("type_scope.is.null,type_scope.eq.vocab");
    }

    const { data: group, error: groupError } = await groupQuery.maybeSingle();

    if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    const { data: cards, error: cardsError } = await supabaseServer
        .from("cards")
        .select("id, type")
        .eq("owner_key", user.id)
        .in("id", cardIds);

    if (cardsError) return NextResponse.json({ error: cardsError.message }, { status: 500 });

    const existingCardIds = new Set(
        (cards ?? [])
            .filter((card) => resolvedType === "sentence" ? card.type === "sentence" : card.type == null || card.type === "vocab")
            .map((card) => String(card.id))
    );
    const validCardIds = cardIds.filter((cardId) => existingCardIds.has(cardId));

    if (validCardIds.length === 0) {
        return NextResponse.json({ assignedCount: 0, skippedCount: cardIds.length });
    }

    const payload = validCardIds.map((cardId) => ({
        owner_key: user.id,
        group_id: groupId,
        card_id: cardId,
    }));

    const { error } = await supabaseServer
        .from("card_groups")
        .upsert(payload, { onConflict: "owner_key,card_id,group_id", ignoreDuplicates: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ assignedCount: validCardIds.length, skippedCount: cardIds.length - validCardIds.length });
}
