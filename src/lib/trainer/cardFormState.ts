import { shouldOpenNotesSection } from "@/lib/trainer/cardFormBehavior";

export type CardFormTextState = {
    german: string;
    swahili: string;
    germanExample: string;
    swahiliExample: string;
};

export type CardFormDraft = CardFormTextState & {
    note: string;
};

export function hasOptionalExamples(germanExample: string | null | undefined, swahiliExample: string | null | undefined) {
    return Boolean((germanExample ?? "").trim() || (swahiliExample ?? "").trim());
}

export function extractCardGroupIds(input: { groups?: Array<{ id?: string | number } | null> | null }) {
    return Array.isArray(input.groups)
        ? input.groups.map((group) => String(group?.id ?? "")).filter(Boolean)
        : [];
}

export function hydrateTextStateFromCard(card: any): CardFormTextState {
    return {
        german: card?.german_text ?? "",
        swahili: card?.swahili_text ?? "",
        germanExample: card?.german_example ?? "",
        swahiliExample: card?.swahili_example ?? "",
    };
}

export function hydrateTextStateFromLearn(input: {
    german?: string | null;
    swahili?: string | null;
    germanExample?: string | null;
    swahiliExample?: string | null;
}): CardFormTextState {
    return {
        german: input.german ?? "",
        swahili: input.swahili ?? "",
        germanExample: input.germanExample ?? "",
        swahiliExample: input.swahiliExample ?? "",
    };
}

export function createDraftFromTextState(text: CardFormTextState, note: string): CardFormDraft {
    return {
        ...text,
        note,
    };
}

export function shouldOpenDraftNotes(note: string) {
    return shouldOpenNotesSection(note);
}

export function resolveExistingImagePath(input: any): string | null {
    return input?.image_path ?? input?.imagePath ?? input?.image ?? null;
}
