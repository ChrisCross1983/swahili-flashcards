import type { AnswerIntent } from "./eval/classify";
import { computeMastery, isDue, type LearnerCardState } from "./learnerModel";
import type { AiTaskType } from "./types";

export type PlannerInput = {
    learnerState: LearnerCardState;
    recentIntents?: AnswerIntent[];
    recentTaskTypes?: AiTaskType[];
    lastTaskType?: AiTaskType;
};

export type PlannerOutput = {
    taskType: AiTaskType;
    difficulty: "support" | "standard" | "challenge";
    rationale: string;
    constraints: { focus: "spelling" | "form" | "recall" | "recognition" };
};

export function planNextTask(input: PlannerInput): PlannerOutput {
    const mastery = computeMastery(input.learnerState);
    const due = isDue(input.learnerState);
    const lastError = input.learnerState.lastErrorType;
    const recentIntents = input.recentIntents ?? [];
    const typoStreak = recentIntents.slice(-3).filter((item) => item === "typo").length;
    const slowCorrect = input.learnerState.avgLatencyMs > 7000 && mastery > 0.4;

    if (typoStreak >= 2 || lastError === "typo") {
        return {
            taskType: "translate",
            difficulty: "support",
            rationale: "Wir üben Schreibgenauigkeit, weil zuletzt Tippfehler aufgetreten sind.",
            constraints: { focus: "spelling" },
        };
    }

    if (!due || mastery >= 0.85) {
        return {
            taskType: "translate",
            difficulty: "challenge",
            rationale: slowCorrect
                ? "Du warst korrekt, aber noch langsam – wir trainieren aktiven Abruf."
                : "Hohe Beherrschung erkannt, deshalb aktiver Abruf ohne starke Hilfen.",
            constraints: { focus: "recall" },
        };
    }

    if (lastError === "wrong" || lastError === "nonsense" || input.learnerState.wrongCount >= 2) {
        return {
            taskType: "mcq",
            difficulty: "support",
            rationale: "Nach mehreren Fehlern nutzen wir eine gestützte Auswahlaufgabe.",
            constraints: { focus: "recognition" },
        };
    }

    if (mastery >= 0.55) {
        return {
            taskType: "cloze",
            difficulty: "standard",
            rationale: "Mittlere Beherrschung: Kontextübung stärkt Form und Bedeutung.",
            constraints: { focus: "form" },
        };
    }

    return {
        taskType: "translate",
        difficulty: "standard",
        rationale: "Wir festigen die Grundlage mit direkter Übersetzung.",
        constraints: { focus: "recall" },
    };
}
