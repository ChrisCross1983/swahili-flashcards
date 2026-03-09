import type { CardPedagogicalProfile } from "./cardInterpreter";
import type { AnswerIntent } from "./eval/classify";
import { computeMastery, isDue, type LearnerCardState } from "./learnerModel";
import type { AiTaskType, LearningObjective } from "./types";

export type PlannerInput = {
    learnerState: LearnerCardState;
    cardProfile?: CardPedagogicalProfile;
    recentIntents?: AnswerIntent[];
    recentTaskTypes?: AiTaskType[];
    lastTaskType?: AiTaskType;
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
};

function objectiveToTaskType(objective: LearningObjective, profile: CardPedagogicalProfile): AiTaskType {
    if (objective === "recognition" || objective === "contrastConfusion") return "mcq";
    if (objective === "repairMistake") return profile.exerciseCapabilities.translation ? "translate" : "mcq";
    if (objective === "guidedRecall") return profile.exerciseCapabilities.cloze ? "cloze" : "translate";
    if (objective === "contextUsage") return profile.exerciseCapabilities.cloze ? "cloze" : "translate";
    return "translate";
}

function isTypeAllowed(type: AiTaskType, profile: CardPedagogicalProfile): boolean {
    if (profile.forbiddenExerciseTypes.includes(type)) return false;
    if (type === "mcq") return profile.exerciseSuitability.recognition;
    if (type === "cloze") return profile.exerciseCapabilities.cloze && (profile.exerciseSuitability.guidedRecall || profile.exerciseSuitability.contextUsage);
    return profile.exerciseCapabilities.translation && (profile.exerciseSuitability.recall || profile.exerciseSuitability.production);
}

function chooseWithVariety(
    preferred: AiTaskType,
    profile: CardPedagogicalProfile,
    recentTaskTypes: AiTaskType[],
    lastTaskType: AiTaskType | undefined,
    intent: AnswerIntent | undefined,
    remediationMode: PlannerOutput["remediationMode"],
): AiTaskType {
    const recent = recentTaskTypes.slice(-3);
    const mcqInRecent = recent.filter((type) => type === "mcq").length;
    const allRecentSame = recent.length >= 2 && recent.every((type) => type === recent[0]);

    if (isTypeAllowed(preferred, profile)) {
        if (
            preferred === "mcq"
            && remediationMode === "none"
            && lastTaskType === "mcq"
            && (intent === "correct" || intent === "almost")
        ) {
            if (isTypeAllowed("cloze", profile)) return "cloze";
            if (isTypeAllowed("translate", profile)) return "translate";
        }

        if (
            preferred === "mcq"
            && remediationMode === "none"
            && (mcqInRecent >= 2 || allRecentSame)
            && isTypeAllowed("translate", profile)
        ) {
            return "translate";
        }

        if (
            preferred === "cloze"
            && profile.unitType !== "word"
            && !profile.exerciseSuitability.contextUsage
            && isTypeAllowed("translate", profile)
        ) {
            return "translate";
        }

        return preferred;
    }

    if (preferred !== "translate" && isTypeAllowed("translate", profile)) return "translate";
    if (preferred !== "cloze" && isTypeAllowed("cloze", profile)) return "cloze";
    return "mcq";
}

export function planNextTask(input: PlannerInput): PlannerOutput {
    const profile = input.cardProfile ?? {
        cardType: "vocab", linguisticUnit: "word", pos: "unknown",
        unitType: "word", linguisticType: "unknown", semanticUse: "unknown",
        morphologicalInfo: {},
        exerciseSuitability: { recognition: true, recall: true, guidedRecall: false, contextUsage: false, contrastLearning: false, production: true },
        forbiddenExerciseTypes: [],
        preferredExerciseTypes: ["translate"],
        explanationStrategy: "meaning_first",
        qualityConfidence: 0.7,
        morphologicalFeatures: {}, semanticComplexity: "simple", learningDifficulty: 2,
        exerciseCapabilities: { translation: true, recognition: true, cloze: false, production: true, contextUsage: false },
        exampleStrategy: "omit_if_low_confidence",
    };
    const mastery = computeMastery(input.learnerState);
    const due = isDue(input.learnerState);
    const lastError = input.learnerState.lastErrorType;
    const recentIntents = input.recentIntents ?? [];
    const recentTaskTypes = input.recentTaskTypes ?? [];
    const lastTaskType = input.lastTaskType ?? recentTaskTypes.at(-1);
    const lastIntent = recentIntents.at(-1);
    const wrongStreak = recentIntents.slice(-2).filter((item) => item === "wrong" || item === "nonsense" || item === "no_attempt").length;

    let objective: LearningObjective = "reinforcement";
    let difficulty: PlannerOutput["difficulty"] = "standard";
    let rationale = "Wir festigen mit aktivem Abruf.";
    let focus: PlannerOutput["constraints"]["focus"] = "recall";
    let remediationMode: PlannerOutput["remediationMode"] = "none";

    if (wrongStreak >= 2 || input.learnerState.wrongCount >= 2) {
        objective = "repairMistake";
        difficulty = "support";
        rationale = "Nach mehreren Fehlern wählen wir eine gestützte Reparaturaufgabe mit klaren Leitplanken.";
        focus = "form";
        remediationMode = "intensive";
    } else if (lastError === "typo" || recentIntents.slice(-3).filter((item) => item === "typo").length >= 2) {
        objective = "recall";
        difficulty = "support";
        rationale = "Zuletzt gab es Form-/Schreibfehler; wir stabilisieren zuerst die Schreibgenauigkeit.";
        focus = "spelling";
        remediationMode = "light";
    } else if (!due || mastery >= 0.85) {
        objective = profile.exerciseCapabilities.contextUsage ? "contextUsage" : "production";
        difficulty = "challenge";
        rationale = "Hohe Beherrschung erkannt; wir transferieren in Kontext statt nur zu reproduzieren.";
        focus = objective === "contextUsage" ? "context" : "recall";
    } else if (mastery <= 0.35) {
        objective = "recognition";
        difficulty = "support";
        rationale = "Niedrige Beherrschung: erst sichere Wiedererkennung vor freiem Abruf.";
        focus = "recognition";
    } else if (mastery >= 0.55) {
        objective = "guidedRecall";
        difficulty = "standard";
        rationale = "Mittlere Beherrschung: wir üben geführten Abruf mit Fokus auf Form + Bedeutung.";
        focus = "form";
    }

    if ((profile.unitType === "phrase" || profile.unitType === "greeting" || profile.unitType === "formula") && objective === "recognition") {
        objective = "guidedRecall";
        focus = "form";
        rationale = "Mehrwort-/Formelkarte: wir üben geführt statt isolierter Erkennung.";
    }

    const plannedTaskType = objective === "recall" && focus === "spelling" ? "translate" : objectiveToTaskType(objective, profile);
    const taskType = chooseWithVariety(plannedTaskType, profile, recentTaskTypes, lastTaskType, lastIntent, remediationMode);

    return {
        objective,
        taskType,
        difficulty,
        rationale,
        constraints: { focus },
        remediationMode,
        showExample: profile.exampleStrategy !== "omit_if_low_confidence" && (objective === "contextUsage" || objective === "guidedRecall"),
        showMorphology: Boolean(profile.morphologicalInfo.nounClass) && (objective === "repairMistake" || objective === "guidedRecall"),
        requiresAiGeneration: objective === "contextUsage" || objective === "production" || profile.exampleStrategy === "ai_required",
    };
}
