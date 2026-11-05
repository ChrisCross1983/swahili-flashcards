import { sanitizeExampleMarkup } from "@/lib/examples/formatting";
import type { SentenceExplanation } from "@/lib/sentence/explanation";

export type CardFormTextInput = {
    german: string;
    swahili: string;
    germanExample: string;
    swahiliExample: string;
};

export function buildCreateCardPayload(input: CardFormTextInput & {
    imagePath: string | null;
    type: "vocab" | "sentence";
    sentenceExplanation?: SentenceExplanation | null;
}) {
    return {
        german: input.german.trim(),
        swahili: input.swahili.trim(),
        germanExample: sanitizeExampleMarkup(input.germanExample) || null,
        swahiliExample: sanitizeExampleMarkup(input.swahiliExample) || null,
        imagePath: input.imagePath,
        type: input.type,
        ...(input.type === "sentence" && input.sentenceExplanation ? { sentenceExplanation: input.sentenceExplanation } : {}),
    };
}

export function buildUpdateCardPayload(input: CardFormTextInput & {
    id: string;
    imagePath?: string | null;
    sentenceExplanation?: SentenceExplanation | null;
}) {
    const payload: Record<string, unknown> = {
        id: input.id,
        german: input.german.trim(),
        swahili: input.swahili.trim(),
        germanExample: sanitizeExampleMarkup(input.germanExample) || null,
        swahiliExample: sanitizeExampleMarkup(input.swahiliExample) || null,
    };

    if ("imagePath" in input) payload.imagePath = input.imagePath ?? null;
    if ("sentenceExplanation" in input) payload.sentenceExplanation = input.sentenceExplanation ?? null;
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
