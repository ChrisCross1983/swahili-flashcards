export type Lang = "sw" | "de";

export type SaveSource =
    | "last_list"
    | "chat_context"
    | "manual"
    | "chat"
    | "training"
    | "user"
    | "assistant_list";
export type SaveDraftStatus = "draft" | "awaiting_confirmation";

export type ActiveSaveDraft = {
    id: string;
    type: "vocab" | "sentence";
    sw: string;
    de: string;
    missing_de: boolean;
    source: SaveSource;
    sourceSnippet?: string;
    notes?: string;
    status: SaveDraftStatus;
    detectedAt: number;
};

export function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.,!?;:()]/g, "");
}

export function canonicalizeToSwDe(input: {
    front_lang: Lang;
    back_lang: Lang;
    front_text: string;
    back_text: string;
}): { sw: string; de: string } {
    const frontText = input.front_text.trim();
    const backText = input.back_text.trim();
    if (input.front_lang === "de" && input.back_lang === "sw") {
        return { sw: backText, de: frontText };
    }
    return { sw: frontText, de: backText };
}

function looksLikeSentence(text: string) {
    return text.trim().split(/\s+/).length > 2 || /[.!?]$/.test(text.trim());
}

export function looksLikeMetaText(value: string): boolean {
    const v = value.trim();
    if (v.length > 60 && !looksLikeSentence(v)) return true;
    if (/meinst du|\u00fcbersetz|was ist die|hinweis|plural|beispiel/i.test(v)) return true;
    return false;
}
