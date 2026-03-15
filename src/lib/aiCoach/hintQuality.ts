import type { AiCoachTask, ErrorCategory } from "./types";

const GENERIC_HINT_PATTERNS = [
    /fokussiere dich/i,
    /kernbegriff/i,
    /wenn unsicher/i,
    /versuche es/i,
    /denk zuerst/i,
];

const GENERIC_EXPLANATION_PATTERNS = [
    /^antwort passt noch nicht\.?$/i,
    /^noch nicht\.?$/i,
    /allgemein/i,
    /versuche es nochmal/i,
];

export function isSpecificHintText(text?: string): boolean {
    if (!text?.trim()) return false;
    const hint = text.trim();
    if (hint.length < 8 || hint.length > 110) return false;
    if (GENERIC_HINT_PATTERNS.some((rx) => rx.test(hint))) return false;
    if (/\b(plural|singular)\b/i.test(hint)) return false;
    return /\b(erst|beginnt|buchstabe|silbe|nominalklasse|kontext|gruß|formel|fixe\s+wendung|feste\s+wendung)\b/i.test(hint);
}

export function filterHintLevels(hints: string[] | undefined): string[] | undefined {
    if (!hints?.length) return hints;
    const filtered = hints.map((hint) => hint.trim()).filter((hint) => isSpecificHintText(hint));
    return filtered.length ? filtered.slice(0, 1) : undefined;
}

export function buildDeterministicExplanation(task: AiCoachTask, error?: ErrorCategory): string | undefined {
    if (!error) return undefined;
    if (error === "wrong_noun_class") {
        const nounClass = task.meta?.nounClass ?? task.profile?.morphologicalInfo.nounClass;
        return nounClass ? `Du hast die Nominalklasse verfehlt; hier passt ${nounClass}.` : "Achte auf die Nominalklassen-Paare (Singular/Plural).";
    }
    if (error === "wrong_form") return "Die Grundbedeutung passt, aber die Form/Endung ist nicht korrekt.";
    if (error === "wrong_word_order") return "Die passenden Wörter sind da, aber die Reihenfolge im Ausdruck ist falsch.";
    if (error === "semantic_confusion") {
        if (task.profile?.unitType === "greeting" || task.profile?.unitType === "formula" || task.profile?.unitType === "phrase") {
            return "Das ist eine feste Wendung; sie wird nicht Wort für Wort übersetzt.";
        }
        return "Die Antwort trifft einen anderen Begriff; achte auf die genaue Bedeutung im Kartenkontext.";
    }
    if (error === "no_attempt") return "Kein Versuch erkannt; als Nächstes kommt eine geführtere Übung.";
    return undefined;
}

export function shouldUseExplanation(text: string | undefined): boolean {
    if (!text?.trim()) return false;
    const cleaned = text.trim();
    if (cleaned.length < 16 || cleaned.length > 220) return false;
    return !GENERIC_EXPLANATION_PATTERNS.some((rx) => rx.test(cleaned));
}
