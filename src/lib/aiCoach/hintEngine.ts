import type { CardPedagogicalProfile } from "./cardInterpreter";

export type ErrorIntent = "typo" | "wrong_form" | "wrong_noun_class" | "semantic_confusion" | "wrong_word_order" | "no_attempt" | "unknown";

export type HintStrategy = "semantic" | "contrast" | "form" | "prefix" | "nounClass";

function inferHintStrategy(profile: CardPedagogicalProfile, intent: ErrorIntent): HintStrategy {
    if (intent === "wrong_noun_class" || profile.morphologicalFeatures.nounClass) return "nounClass";
    if (intent === "wrong_form" || profile.pos === "verb") return "form";
    if (intent === "wrong_word_order" || profile.linguisticUnit === "sentence") return "contrast";
    if (intent === "semantic_confusion") return "semantic";
    return "prefix";
}

function firstSyllable(word: string): string | null {
    const cleaned = word.trim().toLowerCase();
    if (!cleaned) return null;
    const match = cleaned.match(/^(ng'|[bcdfghjklmnpqrstvwxyz]?[aeiou]+)/i);
    return match?.[0] ?? cleaned.slice(0, 2);
}

function buildSingleHint(profile: CardPedagogicalProfile, expectedAnswer: string, intent: ErrorIntent = "unknown"): string | null {
    const strategy = inferHintStrategy(profile, intent);
    const normalized = expectedAnswer.trim();
    const firstLetter = normalized.slice(0, 1);
    const syllable = firstSyllable(normalized);

    if (!normalized) return null;

    if (profile.unitType === "greeting" || profile.unitType === "formula" || profile.unitType === "phrase" || profile.unitType === "expression") {
        return "Feste Wendung: achte auf den passenden Kontext, nicht auf Wort-für-Wort.";
    }

    if (strategy === "semantic" || strategy === "contrast") {
        return firstLetter ? `Erster Buchstabe: ${firstLetter}.` : null;
    }

    if (strategy === "nounClass") {
        if (profile.morphologicalFeatures.nounClass && profile.morphologicalFeatures.nounClass !== "n/n") {
            return "Achte auf die passende Nominalklasse (ohne Singular/Plural vorwegzunehmen).";
        }
        return syllable ? `Erste Silbe: ${syllable}.` : (firstLetter ? `Erster Buchstabe: ${firstLetter}.` : null);
    }

    if (strategy === "form") {
        return syllable ? `Erste Silbe: ${syllable}.` : (firstLetter ? `Erster Buchstabe: ${firstLetter}.` : null);
    }

    return firstLetter ? `Erster Buchstabe: ${firstLetter}.` : null;

}

export function buildHintLevels(profile: CardPedagogicalProfile, expectedAnswer: string, intent: ErrorIntent = "unknown"): string[] {
    const hint = buildSingleHint(profile, expectedAnswer, intent);
    return hint ? [hint] : [];
}
