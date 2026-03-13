import type { AiCoachResult, AiTaskType } from "./types";

export type RecentTaskMemory = {
    recentCardIds?: string[];
    recentDirections?: string[];
    recentObjectives?: string[];
    currentCardId?: string;
    currentDirection?: string;
    lastResult?: AiCoachResult;
};

export function shouldAvoidImmediateReverse(memory: RecentTaskMemory): boolean {
    const current = memory.currentCardId;
    if (!current) return false;
    const shownRecently = (memory.recentCardIds ?? []).slice(-2).includes(current);
    if (!shownRecently) return false;
    const lastDirection = (memory.recentDirections ?? []).at(-1);
    if (!lastDirection || !memory.currentDirection) return false;
    const opposite = (lastDirection === "DE_TO_SW" && memory.currentDirection === "SW_TO_DE")
        || (lastDirection === "SW_TO_DE" && memory.currentDirection === "DE_TO_SW");
    if (!opposite) return false;
    const reason = memory.lastResult?.errorCategory;
    return !(reason === "wrong_form" || reason === "wrong_noun_class" || reason === "wrong_word_order");
}

export function chooseRemediationTaskType(lastResult?: AiCoachResult): AiTaskType | null {
    if (!lastResult || lastResult.correct) return null;
    if (lastResult.errorCategory === "no_attempt") return "mcq";
    if (lastResult.errorCategory === "semantic_confusion") return "mcq";
    if (lastResult.errorCategory === "wrong_form" || lastResult.errorCategory === "wrong_noun_class") return "cloze";
    return "translate";
}
