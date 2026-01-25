export type Lang = "sw" | "de";

export type SaveSource = "last_list" | "chat_context" | "manual";
export type SaveDraftStatus = "draft" | "awaiting_confirmation";

export type ActiveSaveDraft = {
    id: string;
    type: "vocab" | "sentence";
    sw: string;
    de: string;
    missing_de: boolean;
    source: SaveSource;
    sourceSnippet?: string;
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
    if (input.front_lang === "sw" && input.back_lang === "de") {
        return { sw: input.front_text.trim(), de: input.back_text.trim() };
    }
    if (input.front_lang === "de" && input.back_lang === "sw") {
        return { sw: input.back_text.trim(), de: input.front_text.trim() };
    }
    return { sw: input.front_text.trim(), de: input.back_text.trim() };
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