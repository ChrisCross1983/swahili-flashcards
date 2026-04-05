import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";

type UpdateBody = {
    cardId?: string;
    mainNotes?: string;
    memoryHint?: string;
    exampleSentence?: string;
    confusionNote?: string;
};

async function verifyCardOwnership(ownerKey: string, cardId: string) {
    const { data, error } = await supabaseServer
        .from("cards")
        .select("id")
        .eq("id", cardId)
        .eq("owner_key", ownerKey)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data?.id);
}

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const cardId = searchParams.get("cardId");
    if (!cardId) return NextResponse.json({ error: "cardId is required" }, { status: 400 });

    const ownerKey = user.id;
    const owned = await verifyCardOwnership(ownerKey, cardId);
    if (!owned) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });

    const { data, error } = await supabaseServer
        .from("card_notes")
        .select("main_notes, memory_hint, example_sentence, confusion_note")
        .eq("owner_key", ownerKey)
        .eq("card_id", cardId)
        .maybeSingle();

    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Notizen konnten nicht geladen werden." }, { status: 500 });
    }

    return NextResponse.json({ note: data ?? null });
}

export async function PATCH(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const body = (await req.json()) as UpdateBody;
    const cardId = body.cardId?.trim();
    if (!cardId) return NextResponse.json({ error: "cardId is required" }, { status: 400 });

    const ownerKey = user.id;
    const owned = await verifyCardOwnership(ownerKey, cardId);
    if (!owned) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });

    const payload = {
        owner_key: ownerKey,
        card_id: cardId,
        main_notes: body.mainNotes?.trim() ?? "",
        memory_hint: body.memoryHint?.trim() ?? "",
        example_sentence: body.exampleSentence?.trim() ?? "",
        confusion_note: body.confusionNote?.trim() ?? "",
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseServer
        .from("card_notes")
        .upsert(payload, { onConflict: "owner_key,card_id" })
        .select("main_notes, memory_hint, example_sentence, confusion_note")
        .single();

    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Notizen konnten nicht gespeichert werden." }, { status: 500 });
    }

    return NextResponse.json({ note: data });
}
