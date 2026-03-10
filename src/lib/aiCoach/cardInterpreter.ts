import type { CardEnrichment } from "./enrichment/generateEnrichment";

export type CardLike = {
    id: string;
    german_text: string;
    swahili_text: string;
    type?: "vocab" | "sentence" | null;
};

export type UnitType = "single_word" | "noun" | "verb" | "adjective" | "phrase" | "greeting" | "formula" | "full_sentence" | "expression";
export type LinguisticType = "noun" | "verb" | "adjective" | "fixed_phrase" | "sentence" | "unknown";
export type SemanticUse = "object" | "person" | "action" | "greeting" | "time_expression" | "abstract" | "expression" | "unknown";
export type ExerciseMode = "recognition" | "recall" | "guidedRecall" | "contextUsage" | "contrastLearning" | "production";

export type CardPedagogicalProfile = {
    unitType: UnitType;
    linguisticType: LinguisticType;
    semanticUse: SemanticUse;
    contextRequired: boolean;
    morphologyRelevant: boolean;
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

const GREETING_SET = new Set(["hujambo", "habari", "shikamoo", "asante", "karibu", "pole", "mambo", "za asubuhi", "habari za asubuhi"]);

function inferLinguisticType(card: CardLike, enrichment?: CardEnrichment | null): LinguisticType {
    const fromEnrichment = enrichment?.pos;
    if (fromEnrichment === "noun") return "noun";
    if (fromEnrichment === "verb") return "verb";
    if (fromEnrichment === "adj") return "adjective";
    if (fromEnrichment === "phrase") return "fixed_phrase";

    const sw = card.swahili_text.trim().toLowerCase();
    if (card.type === "sentence" || /[.!?]/.test(sw)) return "sentence";
    if (sw.startsWith("ku") && !sw.includes(" ")) return "verb";
    if (sw.includes(" ")) return "fixed_phrase";
    return "unknown";
}

function inferUnitType(card: CardLike, linguisticType: LinguisticType): UnitType {
    const sw = card.swahili_text.trim().toLowerCase();
    const words = sw.split(/\s+/).filter(Boolean);
    if (card.type === "sentence" || /[.!?]/.test(sw) || words.length >= 6) return "full_sentence";
    if (GREETING_SET.has(sw)) return "greeting";
    if (words.length === 1) {
        if (linguisticType === "noun") return "noun";
        if (linguisticType === "verb") return "verb";
        if (linguisticType === "adjective") return "adjective";
        return "single_word";
    }
    if (words.length === 2 && /(za|ya|wa|la|kwa|na|cha|wa)$/.test(words[0])) return "formula";
    if (words.length <= 4) return "phrase";
    return "expression";
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
    if (unitType === "full_sentence" || swLen > 28) return "complex";
    if (unitType === "phrase" || unitType === "formula" || unitType === "expression" || swLen > 12) return "medium";
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
    const linguisticType = inferLinguisticType(card, enrichment);
    const unitType = inferUnitType(card, linguisticType);
    const semanticUse = inferSemanticUse(card, unitType, linguisticType);
    const semanticComplexity = inferComplexity(unitType, card.swahili_text.trim().length);

    const nounClass = enrichment?.noun_class ?? undefined;
    const plural = enrichment?.plural ?? undefined;
    const hasReliableExample = (enrichment?.examples?.length ?? 0) > 0;
    const qualityConfidence = hasReliableExample ? 0.92 : unitType === "full_sentence" ? 0.72 : 0.84;

    const contextRequired = unitType === "greeting" || unitType === "formula" || unitType === "phrase" || unitType === "expression" || unitType === "full_sentence";
    const morphologyRelevant = Boolean(nounClass) || linguisticType === "verb";

    const exerciseSuitability: CardPedagogicalProfile["exerciseSuitability"] = {
        recognition: unitType !== "full_sentence" && unitType !== "expression",
        recall: unitType !== "full_sentence" || card.swahili_text.trim().split(/\s+/).length <= 8,
        guidedRecall: unitType !== "greeting" && hasReliableExample,
        contextUsage: contextRequired || linguisticType === "verb",
        contrastLearning: linguisticType === "noun" || unitType === "greeting" || unitType === "formula" || unitType === "phrase",
        production: unitType === "verb" || unitType === "phrase" || unitType === "full_sentence",
    };

    const forbiddenExerciseTypes: CardPedagogicalProfile["forbiddenExerciseTypes"] = [];
    if (!exerciseSuitability.recognition) forbiddenExerciseTypes.push("mcq");
    if (!exerciseSuitability.guidedRecall) forbiddenExerciseTypes.push("cloze");
    if (!exerciseSuitability.recall && !exerciseSuitability.production) forbiddenExerciseTypes.push("translate");
    if ((unitType === "greeting" || unitType === "formula") && !forbiddenExerciseTypes.includes("cloze")) forbiddenExerciseTypes.push("cloze");

    const preferredExerciseTypes: CardPedagogicalProfile["preferredExerciseTypes"] = [];
    if (exerciseSuitability.recall) preferredExerciseTypes.push("translate");
    if (exerciseSuitability.recognition && (unitType === "single_word" || unitType === "noun" || unitType === "adjective")) preferredExerciseTypes.push("mcq");
    if (exerciseSuitability.guidedRecall) preferredExerciseTypes.push("cloze");

    return {
        unitType,
        linguisticType,
        semanticUse,
        contextRequired,
        morphologyRelevant,
        morphologicalInfo: {
            nounClass,
            singular: card.swahili_text.trim(),
            plural,
            tense: linguisticType === "verb" ? "infinitive" : undefined,
        },
        exerciseSuitability,
        forbiddenExerciseTypes,
        preferredExerciseTypes,
        explanationStrategy: morphologyRelevant ? "form_first" : contextRequired ? "contrastive" : "meaning_first",
        exampleStrategy: hasReliableExample ? "enrichment_preferred" : qualityConfidence < 0.75 ? "omit_if_low_confidence" : "ai_required",
        qualityConfidence,

        cardType: unitType === "full_sentence" ? "sentence" : unitType === "single_word" || unitType === "noun" || unitType === "verb" || unitType === "adjective" ? "vocab" : "phrase",
        linguisticUnit: unitType === "full_sentence" ? "sentence" : (unitType === "single_word" || unitType === "noun" || unitType === "verb" || unitType === "adjective") ? "word" : "compound",
        pos: toLegacyPos(linguisticType),
        morphologicalFeatures: { nounClass, plural, tense: linguisticType === "verb" ? "infinitive" : undefined },
        semanticComplexity,
        learningDifficulty: semanticComplexity === "simple" ? 2 : semanticComplexity === "medium" ? 3 : 4,
        exerciseCapabilities: {
            translation: !forbiddenExerciseTypes.includes("translate"),
            recognition: exerciseSuitability.recognition,
            cloze: !forbiddenExerciseTypes.includes("cloze") && hasReliableExample,
            production: exerciseSuitability.production,
            contextUsage: exerciseSuitability.contextUsage,
        },
    };
}
