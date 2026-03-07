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
};

function objectiveToTaskType(objective: LearningObjective, profile: CardPedagogicalProfile): AiTaskType {
    if (objective === "recognition" || objective === "errorRemediation") return "mcq";
    if (objective === "guidedRecall" || objective === "contrastLearning") return profile.exerciseCapabilities.cloze ? "cloze" : "mcq";
    if (objective === "contextUsage") return profile.exerciseCapabilities.cloze ? "cloze" : "translate";
    return "translate";
}

export function planNextTask(input: PlannerInput): PlannerOutput {
    const profile = input.cardProfile ?? {
        cardType: "vocab", linguisticUnit: "word", pos: "unknown",
        morphologicalFeatures: {}, semanticComplexity: "simple", learningDifficulty: 2,
        exerciseCapabilities: { translation: true, recognition: true, cloze: false, production: true, contextUsage: false },
        exampleStrategy: "templateSafe",
    };
    const mastery = computeMastery(input.learnerState);
    const due = isDue(input.learnerState);
    const lastError = input.learnerState.lastErrorType;
    const recentIntents = input.recentIntents ?? [];
    const wrongStreak = recentIntents.slice(-2).filter((item) => item === "wrong" || item === "nonsense" || item === "no_attempt").length;

    let objective: LearningObjective = "reinforcement";
    let difficulty: PlannerOutput["difficulty"] = "standard";
    let rationale = "Wir festigen mit aktivem Abruf.";
    let focus: PlannerOutput["constraints"]["focus"] = "recall";

    if (wrongStreak >= 2 || input.learnerState.wrongCount >= 2) {
        objective = "guidedRecall";
        difficulty = "support";
        rationale = "Nach mehreren Fehlern führen wir über gestützten Abruf zurück zur Sicherheit.";
        focus = "recognition";
    } else if (lastError === "typo" || recentIntents.slice(-3).filter((item) => item === "typo").length >= 2) {
        objective = "recall";
        difficulty = "support";
        rationale = "Zuletzt gab es Form-/Schreibfehler; wir stabilisieren zuerst die Schreibgenauigkeit.";
        focus = "spelling";
    } else if (!due || mastery >= 0.85) {
        objective = profile.exerciseCapabilities.contextUsage ? "contextUsage" : "recall";
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

    return {
        objective,
        taskType: objective === "recall" && focus === "spelling" ? "translate" : objectiveToTaskType(objective, profile),
        difficulty,
        rationale,
        constraints: { focus },
    };
}
