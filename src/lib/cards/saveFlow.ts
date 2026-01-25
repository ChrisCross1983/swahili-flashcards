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
    const frontText = input.front_text.trim();
    const backText = input.back_text.trim();
    let shouldSwap = input.front_lang === "de" && input.back_lang === "sw";

    if (!shouldSwap) {
        const frontGuess = inferLangFromText(frontText);
        const backGuess = inferLangFromText(backText);
        if (frontGuess === "de" && backGuess === "sw") {
            shouldSwap = true;
        }
    }
    if (shouldSwap) {
        return { sw: backText, de: frontText };
    }
    return { sw: frontText, de: backText };
}

function looksLikeSentence(text: string) {
    return text.trim().split(/\s+/).length > 2 || /[.!?]$/.test(text.trim());
}

function inferLangFromText(value: string): Lang | null {
    const raw = value.trim();
    const normalized = raw.toLowerCase();
    if (!normalized) return null;
    const hasSwPattern = /(ng'|ny|sh|gh|dh|kw|mw|bw|mb|nd|nj)/.test(normalized);
    if (!hasSwPattern && /^[A-ZÄÖÜ][a-zäöüß]+$/.test(raw)) return "de";
    if (/[äöüß]/.test(normalized)) return "de";
    if (/\b(der|die|das|ein|eine|einen|einem|einer|und|nicht|mit|ohne)\b/.test(normalized)) {
        return "de";
    }
    if (/(chen|lein|ung|keit|heit|schaft|tion|ismus|ieren|lich|ig|isch|en|er)$/.test(normalized)) {
        return "de";
    }
    if (/^[a-z\s'-]+$/.test(normalized)) return "sw";
    return null;
}

export function looksLikeMetaText(value: string): boolean {
    const v = value.trim();
    if (v.length > 60 && !looksLikeSentence(v)) return true;
    if (/meinst du|\u00fcbersetz|was ist die|hinweis|plural|beispiel/i.test(v)) return true;
    return false;
}
