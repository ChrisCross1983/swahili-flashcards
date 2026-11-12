import { supabaseServer } from "@/lib/supabaseServer";

export type NoteFields = {
    main_notes?: string | null;
    memory_hint?: string | null;
    example_sentence?: string | null;
    confusion_note?: string | null;
};

export function hasCardNote(note: NoteFields, cardType: string | null | undefined): boolean {
    const fields = cardType === "sentence"
        ? [note.main_notes, note.memory_hint, note.example_sentence, note.confusion_note]
        : [note.main_notes];
    return fields.some((value) => typeof value === "string" && value.trim().length > 0);
}

export async function getCardNotes(ownerKey: string, cards: Array<{ id: string | number }>): Promise<Map<string, NoteFields>> {
    const notes = new Map<string, NoteFields>();
    const cardIds = cards.map((card) => String(card.id));
    for (let offset = 0; offset < cardIds.length; offset += 200) {
        const { data, error } = await supabaseServer.from("card_notes")
            .select("card_id, main_notes, memory_hint, example_sentence, confusion_note")
            .eq("owner_key", ownerKey)
            .in("card_id", cardIds.slice(offset, offset + 200));
        if (error) throw error;
        for (const note of data ?? []) {
            const cardId = String(note.card_id);
            notes.set(cardId, note);
        }
    }
    return notes;
}

export async function getCardNotePresence(ownerKey: string, cards: Array<{ id: string | number; type?: string | null }>): Promise<Set<string>> {
    const notes = await getCardNotes(ownerKey, cards);
    return new Set(cards.filter((card) => hasCardNote(notes.get(String(card.id)) ?? {}, card.type)).map((card) => String(card.id)));
}
