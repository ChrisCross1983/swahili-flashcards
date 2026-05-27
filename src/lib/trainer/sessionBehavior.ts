import { resolveTrainingGroupIds, type TrainingMaterial } from "@/lib/trainer/setup";
import type { Direction, TodayItem } from "@/lib/trainer/types";

export type LearnMode = "LEITNER_TODAY" | "DRILL" | null;

export type SessionLoadPlan =
    | { kind: "today" }
    | { kind: "all"; groupIds?: string[] }
    | { kind: "last-missed" };

export function chooseDirection(
    directionMode: "DE_TO_SW" | "SW_TO_DE" | "RANDOM",
    random: () => number = Math.random,
): Direction {
    if (directionMode === "RANDOM") return random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE";
    return directionMode;
}

export function getSessionLoadPlan(learnMode: LearnMode, trainingMaterial: TrainingMaterial): SessionLoadPlan | null {
    if (learnMode === "LEITNER_TODAY") return { kind: "today" };
    if (learnMode !== "DRILL") return null;
    if (trainingMaterial.kind === "LAST_MISSED") return { kind: "last-missed" };
    return { kind: "all", groupIds: resolveTrainingGroupIds(trainingMaterial) };
}

export function shouldAddLastMissed(correct: boolean, cardId: string | null | undefined): boolean {
    return !correct && Boolean(cardId);
}

export function shouldRemoveLastMissed(params: {
    learnMode: LearnMode;
    trainingMaterial: TrainingMaterial;
    correct: boolean;
    cardId: string | null | undefined;
}): boolean {
    return params.learnMode === "DRILL"
        && params.trainingMaterial.kind === "LAST_MISSED"
        && params.correct
        && Boolean(params.cardId);
}

export function canAcceptGradeTap(params: {
    gradingInFlight: boolean;
    isRecording: boolean;
    hasItem: boolean;
}): boolean {
    return !params.gradingInFlight && !params.isRecording && params.hasItem;
}

export function sessionSummaryMode(learnMode: LearnMode): "LEITNER" | "DRILL" {
    return learnMode === "DRILL" ? "DRILL" : "LEITNER";
}

export function repeatWrongItems(sessionWrongItems: Record<string, TodayItem>): TodayItem[] {
    return Object.values(sessionWrongItems);
}
