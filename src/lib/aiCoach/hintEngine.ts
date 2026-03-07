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

export function buildHintLevels(profile: CardPedagogicalProfile, expectedAnswer: string, intent: ErrorIntent = "unknown"): string[] {
    const strategy = inferHintStrategy(profile, intent);
    const normalized = expectedAnswer.trim();

    if (strategy === "nounClass") {
        const nounClass = profile.morphologicalFeatures.nounClass ?? "(nicht markiert)";
        const plural = profile.morphologicalFeatures.plural ? `Plural: ${profile.morphologicalFeatures.plural}.` : "";
        return [
            `Nominalklasse beachten: ${nounClass}.`,
            plural || "Achte auf den passenden Singular/Plural-Wechsel.",
            normalized ? `Antwort beginnt mit: ${normalized.slice(0, 2)}…` : "",
        ].filter(Boolean);
    }

    if (strategy === "form") {
        return [
            "Achte auf Stamm + Endung (Verbform).",
            "Sprich die Antwort laut und prüfe die Form.",
            normalized ? `Erster Buchstabe: ${normalized.slice(0, 1)}.` : "",
        ].filter(Boolean);
    }

    if (strategy === "contrast") {
        return [
            "Behalte die Satzreihenfolge bei (Subjekt → Verb → Objekt).",
            "Konzentriere dich auf die Schlüsselwörter im Kontext.",
            normalized ? `Zielausdruck startet mit: ${normalized.slice(0, 1)}.` : "",
        ].filter(Boolean);
    }

    if (strategy === "semantic") {
        return [
            "Denk zuerst an die Bedeutung, dann an die genaue Form.",
            "Verwechsele das Wort nicht mit einem nahen Synonym.",
            normalized ? `Gesuchtes Wort startet mit: ${normalized.slice(0, 1)}.` : "",
        ].filter(Boolean);
    }

    return [
        "Fokussiere dich auf den Kernbegriff.",
        normalized ? `Erster Buchstabe: ${normalized.slice(0, 1)}.` : "Kurz und präzise antworten.",
        "Wenn unsicher: erst Stammwort, dann Endung ergänzen.",
    ];
}
