import type { CardPedagogicalProfile } from "./cardInterpreter";
import type { AnswerIntent } from "./eval/classify";
import { computeMastery, isDue, type LearnerCardState } from "./learnerModel";
import type { AiTaskType, LearningObjective } from "./types";
import { hashToUnit } from "./variation";

export type PlannerInput = {
    learnerState: LearnerCardState;
    cardProfile?: CardPedagogicalProfile;
    recentIntents?: AnswerIntent[];
    recentTaskTypes?: AiTaskType[];
    lastTaskType?: AiTaskType;
    variationSeed?: string;
};

export type PlannerOutput = {
    objective: LearningObjective;
    taskType: AiTaskType;
    difficulty: "support" | "standard" | "challenge";
    rationale: string;
    constraints: { focus: "spelling" | "form" | "recall" | "recognition" | "context" };
    remediationMode: "none" | "light" | "intensive";
    showExample: boolean;
    showMorphology: boolean;
    requiresAiGeneration: boolean;
    resultCardPlan: {
        includeCorrectAnswer: boolean;
        includeMorphology: boolean;
        includeExample: boolean;
        includeContrastNote: boolean;
        includeUsageContext: boolean;
        includeExplanation: boolean;
        includeNextStep: boolean;
    };
};

function objectiveToTaskType(objective: LearningObjective, profile: CardPedagogicalProfile): AiTaskType {
    if (objective === "recognition") return "mcq";
    if (objective === "guidedRecall") return profile.exerciseCapabilities.cloze ? "cloze" : "translate";
    if (objective === "contextUsage" || objective === "sentenceUnderstanding") return profile.exerciseCapabilities.cloze ? "cloze" : "translate";
    if (objective === "confusionRepair") return profile.exerciseCapabilities.translation ? "translate" : "mcq";
    return "translate";
}

function isTypeAllowed(type: AiTaskType, profile: CardPedagogicalProfile): boolean {
    if (profile.forbiddenExerciseTypes.includes(type)) return false;
    if (type === "mcq") return profile.exerciseSuitability.recognition;
    if (type === "cloze") return profile.exerciseCapabilities.cloze && (profile.exerciseSuitability.guidedRecall || profile.exerciseSuitability.contextUsage);
    return profile.exerciseCapabilities.translation && (profile.exerciseSuitability.recall || profile.exerciseSuitability.production);
}

function chooseWithVariety(preferred: AiTaskType, profile: CardPedagogicalProfile, recentTaskTypes: AiTaskType[], lastTaskType: AiTaskType | undefined, variationSeed?: string): AiTaskType {
    const recent = recentTaskTypes.slice(-3);
    if (preferred === "mcq" && lastTaskType === "mcq" && isTypeAllowed("translate", profile)) return "translate";
    if (recent.length >= 3 && recent.every((t) => t === recent[0])) {
        if (recent[0] !== "translate" && isTypeAllowed("translate", profile)) return "translate";
        if (recent[0] !== "cloze" && isTypeAllowed("cloze", profile)) return "cloze";
    }

    const randomRoll = variationSeed ? hashToUnit(variationSeed) : 0;
    if (randomRoll > 0.66) {
        const alternative = preferred === "translate" ? "mcq" : "translate";
        if (alternative !== lastTaskType && isTypeAllowed(alternative, profile)) return alternative;
    }
    if (isTypeAllowed(preferred, profile)) return preferred;
    if (preferred !== "translate" && isTypeAllowed("translate", profile)) return "translate";
    if (preferred !== "cloze" && isTypeAllowed("cloze", profile)) return "cloze";
    return "mcq";
}

function buildResultCardPlan(profile: CardPedagogicalProfile, objective: LearningObjective) {
    const includeMorphology = profile.morphologyRelevant && (objective === "morphologyFocus" || objective === "confusionRepair" || objective === "guidedRecall");
    const includeExample = profile.contextRequired && (objective === "contextUsage" || objective === "phraseMeaning" || objective === "sentenceUnderstanding");
    const includeContrastNote = profile.exerciseSuitability.contrastLearning && (objective === "confusionRepair" || objective === "phraseMeaning");
    const includeUsageContext = profile.contextRequired && (objective === "contextUsage" || objective === "phraseMeaning" || objective === "sentenceUnderstanding");
    return {
        includeCorrectAnswer: true,
        includeMorphology,
        includeExample,
        includeContrastNote,
        includeUsageContext,
        includeExplanation: objective !== "recognition",
        includeNextStep: objective === "guidedRecall" || objective === "confusionRepair",
    };
}

export function planNextTask(input: PlannerInput): PlannerOutput {
    const profile = input.cardProfile ?? {
        cardType: "vocab", linguisticUnit: "word", pos: "unknown",
        unitType: "single_word", linguisticType: "unknown", semanticUse: "unknown", contextRequired: false, morphologyRelevant: false,
        morphologicalInfo: {},
        exerciseSuitability: { recognition: true, recall: true, guidedRecall: false, contextUsage: false, contrastLearning: false, production: true },
        forbiddenExerciseTypes: [], preferredExerciseTypes: ["translate"],
        explanationStrategy: "meaning_first", qualityConfidence: 0.7,
        morphologicalFeatures: {}, semanticComplexity: "simple", learningDifficulty: 2,
        exerciseCapabilities: { translation: true, recognition: true, cloze: false, production: true, contextUsage: false },
        exampleStrategy: "omit_if_low_confidence",
    };
    const mastery = computeMastery(input.learnerState);
    const due = isDue(input.learnerState);
    const recentIntents = input.recentIntents ?? [];
    const recentTaskTypes = input.recentTaskTypes ?? [];
    const lastTaskType = input.lastTaskType ?? recentTaskTypes.at(-1);
    const wrongStreak = recentIntents.slice(-2).filter((item) => item === "wrong" || item === "nonsense" || item === "no_attempt").length;

    let objective: LearningObjective = "recall";
    let difficulty: PlannerOutput["difficulty"] = "standard";
    let rationale = "Wir festigen mit aktivem Abruf.";
    let focus: PlannerOutput["constraints"]["focus"] = "recall";
    let remediationMode: PlannerOutput["remediationMode"] = "none";

    if (recentIntents.slice(-3).filter((item) => item === "typo").length >= 2 || input.learnerState.lastErrorType === "typo") {
        objective = "recall";
        difficulty = "support";
        rationale = "Nach wiederholten Tipp-/Formfehlern festigen wir die korrekte Schreibform.";
        focus = "spelling";
        remediationMode = "light";
    } else if (wrongStreak >= 2 || input.learnerState.wrongCount >= 2) {
        objective = profile.morphologyRelevant ? "morphologyFocus" : "confusionRepair";
        difficulty = "support";
        rationale = "Nach mehreren Fehlern setzen wir auf reparierende, stärker geführte Übung.";
        focus = "form";
        remediationMode = "intensive";
    } else if (mastery <= 0.35) {
        objective = profile.unitType === "phrase" || profile.unitType === "greeting" || profile.unitType === "formula" ? "phraseMeaning" : "recognition";
        difficulty = "support";
        rationale = "Niedrige Beherrschung: zuerst sichere Bedeutungserkennung.";
        focus = "recognition";
    } else if (profile.unitType === "full_sentence") {
        objective = "sentenceUnderstanding";
        difficulty = mastery >= 0.75 ? "challenge" : "standard";
        rationale = "Bei Satzkarten trainieren wir Verstehen vor isoliertem Wortabruf.";
        focus = "context";
    } else if (!due || mastery >= 0.85) {
        objective = profile.contextRequired ? "contextUsage" : "recall";
        difficulty = "challenge";
        rationale = "Hohe Beherrschung erkannt; wir stärken Transfer und Anwendung.";
        focus = objective === "contextUsage" ? "context" : "recall";
    } else if (mastery >= 0.55) {
        objective = "guidedRecall";
        difficulty = "standard";
        rationale = "Mittlere Beherrschung: geführter Abruf mit Formfokus.";
        focus = "form";
    }

    const plannedTaskType = objectiveToTaskType(objective, profile);
    const taskType = chooseWithVariety(plannedTaskType, profile, recentTaskTypes, lastTaskType, input.variationSeed);

    return {
        objective,
        taskType,
        difficulty,
        rationale,
        constraints: { focus },
        remediationMode,
        showExample: buildResultCardPlan(profile, objective).includeExample,
        showMorphology: buildResultCardPlan(profile, objective).includeMorphology,
        requiresAiGeneration: objective === "contextUsage" || objective === "sentenceUnderstanding" || profile.exampleStrategy === "ai_required",
        resultCardPlan: buildResultCardPlan(profile, objective),
    };
}
