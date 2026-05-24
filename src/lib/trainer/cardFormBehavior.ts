import { sanitizeExampleMarkup } from "@/lib/examples/formatting";

export type CardFormTextInput = {
    german: string;
    swahili: string;
    germanExample: string;
    swahiliExample: string;
};

export function buildCreateCardPayload(input: CardFormTextInput & {
    imagePath: string | null;
    type: "vocab" | "sentence";
}) {
    return {
        german: input.german.trim(),
        swahili: input.swahili.trim(),
        germanExample: sanitizeExampleMarkup(input.germanExample) || null,
        swahiliExample: sanitizeExampleMarkup(input.swahiliExample) || null,
        imagePath: input.imagePath,
        type: input.type,
    };
}

export function buildUpdateCardPayload(input: CardFormTextInput & {
    id: string;
    imagePath?: string | null;
}) {
    const payload: Record<string, string | null> = {
        id: input.id,
        german: input.german.trim(),
        swahili: input.swahili.trim(),
        germanExample: sanitizeExampleMarkup(input.germanExample) || null,
        swahiliExample: sanitizeExampleMarkup(input.swahiliExample) || null,
    };

    if ("imagePath" in input) payload.imagePath = input.imagePath ?? null;
    return payload;
}

export function diffGroupAssignments(existingIds: string[], nextIds: string[]) {
    const existing = new Set(existingIds.map(String));
    const next = new Set(nextIds.map(String));
    return {
        add: Array.from(next).filter((id) => !existing.has(id)),
        remove: Array.from(existing).filter((id) => !next.has(id)),
    };
}

export function shouldSaveCreateNote(cardId: string | null, noteText: string): cardId is string {
    return Boolean(cardId) && noteText.trim().length > 0;
}

export function shouldOpenNotesSection(noteText: string): boolean {
    return Boolean(noteText.trim());
}
