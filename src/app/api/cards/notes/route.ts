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

const NOTE_COLUMNS = [
    ["mainNotes", "main_notes"],
    ["memoryHint", "memory_hint"],
    ["exampleSentence", "example_sentence"],
    ["confusionNote", "confusion_note"],
] as const;
const NOTE_SELECT = "main_notes, memory_hint, example_sentence, confusion_note";

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
        .select(NOTE_SELECT)
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

    const body = (await req.json().catch(() => null)) as UpdateBody | null;
    const cardId = typeof body?.cardId === "string" ? body.cardId.trim() : "";
    if (!cardId) return NextResponse.json({ error: "cardId is required" }, { status: 400 });

    const changes: Record<string, string> = {};
    for (const [inputKey, column] of NOTE_COLUMNS) {
        if (!Object.prototype.hasOwnProperty.call(body, inputKey)) continue;
        const value = body?.[inputKey];
        if (typeof value !== "string") return NextResponse.json({ error: "Ungültige Notizen." }, { status: 400 });
        changes[column] = value;
    }
    if (Object.keys(changes).length === 0) return NextResponse.json({ error: "Keine Notizänderung übermittelt." }, { status: 400 });

    const ownerKey = user.id;
    const owned = await verifyCardOwnership(ownerKey, cardId);
    if (!owned) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });

    const updatedAt = new Date().toISOString();
    const updateExisting = () => supabaseServer.from("card_notes")
        .update({ ...changes, updated_at: updatedAt })
        .eq("owner_key", ownerKey).eq("card_id", cardId)
        .select(NOTE_SELECT).maybeSingle();

    const updated = await updateExisting();
    if (updated.error) {
        console.error(updated.error);
        return NextResponse.json({ error: "Notizen konnten nicht gespeichert werden." }, { status: 500 });
    }
    if (updated.data) return NextResponse.json({ note: updated.data });

    const inserted = await supabaseServer.from("card_notes")
        .insert({
            owner_key: ownerKey,
            card_id: cardId,
            main_notes: "",
            memory_hint: "",
            example_sentence: "",
            confusion_note: "",
            ...changes,
            updated_at: updatedAt,
        })
        .select(NOTE_SELECT).single();
    if (!inserted.error) return NextResponse.json({ note: inserted.data });

    // A concurrent first write may have inserted this note row. Apply only this request's fields.
    if (inserted.error.code === "23505") {
        const retry = await updateExisting();
        if (!retry.error && retry.data) return NextResponse.json({ note: retry.data });
        if (retry.error) console.error(retry.error);
    } else {
        console.error(inserted.error);
    }
    return NextResponse.json({ error: "Notizen konnten nicht gespeichert werden." }, { status: 500 });
}
