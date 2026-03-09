import type { CardEnrichment } from "./enrichment/generateEnrichment";

export type CardLike = {
    id: string;
    german_text: string;
    swahili_text: string;
    type?: "vocab" | "sentence" | null;
};

export type UnitType = "word" | "phrase" | "sentence" | "greeting" | "formula" | "expression";
export type LinguisticType = "noun" | "verb" | "adjective" | "fixed_phrase" | "sentence" | "unknown";
export type SemanticUse = "object" | "person" | "action" | "greeting" | "time_expression" | "abstract" | "expression" | "unknown";
export type ExerciseMode = "recognition" | "recall" | "guidedRecall" | "contextUsage" | "contrastLearning" | "production";

export type CardPedagogicalProfile = {
    unitType: UnitType;
    linguisticType: LinguisticType;
    semanticUse: SemanticUse;
    morphologicalInfo: {
        nounClass?: string;
        singular?: string;
        plural?: string;
        tense?: "infinitive" | "present" | "past" | "future" | "unknown";
    };
    exerciseSuitability: Record<ExerciseMode, boolean>;
    forbiddenExerciseTypes: Array<"mcq" | "cloze" | "translate">;
    preferredExerciseTypes: Array<"mcq" | "cloze" | "translate">;
    explanationStrategy: "meaning_first" | "form_first" | "contrastive";
    exampleStrategy: "omit_if_low_confidence" | "enrichment_preferred" | "ai_required";
    qualityConfidence: number;

    // Backward-compatible aliases currently used by existing modules/tests.
    cardType: "vocab" | "sentence" | "phrase";
    linguisticUnit: "word" | "compound" | "sentence";
    pos: "noun" | "verb" | "adjective" | "expression" | "unknown";
    morphologicalFeatures: {
        nounClass?: string;
        plural?: string;
        tense?: "infinitive" | "present" | "past" | "future" | "unknown";
    };
    semanticComplexity: "simple" | "medium" | "complex";
    learningDifficulty: 1 | 2 | 3 | 4 | 5;
    exerciseCapabilities: {
        translation: boolean;
        recognition: boolean;
        cloze: boolean;
        production: boolean;
        contextUsage: boolean;
    };
};

const GREETING_SET = new Set(["hujambo", "habari", "shikamoo", "asante", "karibu", "pole"]);

function inferUnitType(card: CardLike): UnitType {
    const sw = card.swahili_text.trim().toLowerCase();
    const words = sw.split(/\s+/).filter(Boolean);
    if (card.type === "sentence" || /[.!?]/.test(sw) || words.length >= 5) return "sentence";
    if (GREETING_SET.has(sw)) return "greeting";
    if (words.length === 1) return "word";
    if (words.length === 2 && /(za|ya|wa|la|kwa|na)/.test(words[0])) return "formula";
    if (words.length <= 3) return "phrase";
    return "expression";
}

function inferLinguisticType(card: CardLike, enrichment?: CardEnrichment | null): LinguisticType {
    const fromEnrichment = enrichment?.pos;
    if (fromEnrichment === "noun") return "noun";
    if (fromEnrichment === "verb") return "verb";
    if (fromEnrichment === "adj") return "adjective";
    if (fromEnrichment === "phrase") return "fixed_phrase";

    const sw = card.swahili_text.trim().toLowerCase();
    if (card.type === "sentence" || /[.!?]/.test(sw)) return "sentence";
    if (sw.startsWith("ku")) return "verb";
    if (sw.includes(" ")) return "fixed_phrase";
    return "unknown";
}

function inferSemanticUse(card: CardLike, unitType: UnitType, linguisticType: LinguisticType): SemanticUse {
    const sw = card.swahili_text.toLowerCase();
    if (unitType === "greeting") return "greeting";
    if (linguisticType === "verb") return "action";
    if (/leo|jana|kesho|asubuhi|jioni/.test(sw)) return "time_expression";
    if (/mama|baba|mtu|rafiki/.test(sw)) return "person";
    if (linguisticType === "noun") return "object";
    if (unitType === "expression" || unitType === "formula") return "expression";
    return "unknown";
}

function inferComplexity(unitType: UnitType, swLen: number): "simple" | "medium" | "complex" {
    if (unitType === "sentence" || swLen > 20) return "complex";
    if (unitType === "phrase" || unitType === "formula" || swLen > 10) return "medium";
    return "simple";
}

function toLegacyPos(type: LinguisticType): CardPedagogicalProfile["pos"] {
    if (type === "noun") return "noun";
    if (type === "verb") return "verb";
    if (type === "adjective") return "adjective";
    if (type === "fixed_phrase" || type === "sentence") return "expression";
    return "unknown";
}

export function interpretCard(card: CardLike, enrichment?: CardEnrichment | null): CardPedagogicalProfile {
    const unitType = inferUnitType(card);
    const linguisticType = inferLinguisticType(card, enrichment);
    const semanticUse = inferSemanticUse(card, unitType, linguisticType);
    const semanticComplexity = inferComplexity(unitType, card.swahili_text.trim().length);

    const nounClass = enrichment?.noun_class ?? undefined;
    const plural = enrichment?.plural ?? undefined;
    const qualityConfidence = enrichment?.examples?.length ? 0.92 : unitType === "sentence" ? 0.7 : 0.82;

    const isFormulaLike = unitType === "phrase" || unitType === "greeting" || unitType === "formula" || unitType === "expression";

    const exerciseSuitability: CardPedagogicalProfile["exerciseSuitability"] = {
        recognition: unitType !== "sentence",
        recall: unitType !== "sentence" || card.swahili_text.trim().split(/\s+/).length <= 7,
        guidedRecall: true,
        contextUsage: unitType !== "word" || linguisticType === "verb" || linguisticType === "fixed_phrase",
        contrastLearning: linguisticType === "noun" || linguisticType === "fixed_phrase" || unitType === "greeting",
        production: unitType !== "greeting" && unitType !== "formula",
    };

    const forbiddenExerciseTypes: CardPedagogicalProfile["forbiddenExerciseTypes"] = [];
    if (!exerciseSuitability.contextUsage && unitType === "word") forbiddenExerciseTypes.push("cloze");
    if (unitType === "greeting" || unitType === "formula") forbiddenExerciseTypes.push("cloze");
    if (!exerciseSuitability.production && unitType !== "greeting") forbiddenExerciseTypes.push("translate");

    const preferredExerciseTypes: CardPedagogicalProfile["preferredExerciseTypes"] = [];
    if (exerciseSuitability.recall) preferredExerciseTypes.push("translate");
    if (!isFormulaLike && exerciseSuitability.recognition) preferredExerciseTypes.push("mcq");
    if (exerciseSuitability.guidedRecall && (enrichment?.examples?.length ?? 0) > 0 && !forbiddenExerciseTypes.includes("cloze")) preferredExerciseTypes.push("cloze");

    return {
        unitType,
        linguisticType,
        semanticUse,
        morphologicalInfo: {
            nounClass,
            singular: card.swahili_text.trim(),
            plural,
            tense: linguisticType === "verb" ? "infinitive" : undefined,
        },
        exerciseSuitability,
        forbiddenExerciseTypes,
        preferredExerciseTypes,
        explanationStrategy: linguisticType === "noun" ? "form_first" : unitType === "expression" ? "contrastive" : "meaning_first",
        exampleStrategy: enrichment?.examples?.length ? "enrichment_preferred" : qualityConfidence < 0.75 ? "omit_if_low_confidence" : "ai_required",
        qualityConfidence,

        cardType: card.type === "sentence" ? "sentence" : unitType === "word" ? "vocab" : "phrase",
        linguisticUnit: unitType === "sentence" ? "sentence" : unitType === "word" ? "word" : "compound",
        pos: toLegacyPos(linguisticType),
        morphologicalFeatures: { nounClass, plural, tense: linguisticType === "verb" ? "infinitive" : undefined },
        semanticComplexity,
        learningDifficulty: semanticComplexity === "simple" ? 2 : semanticComplexity === "medium" ? 3 : 4,
        exerciseCapabilities: {
            translation: !forbiddenExerciseTypes.includes("translate"),
            recognition: exerciseSuitability.recognition,
            cloze: !forbiddenExerciseTypes.includes("cloze") && (enrichment?.examples?.length ?? 0) > 0,
            production: exerciseSuitability.production,
            contextUsage: exerciseSuitability.contextUsage,
        },
    };
}
