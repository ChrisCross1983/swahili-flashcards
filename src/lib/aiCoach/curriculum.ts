import type { AiEvaluationResult, AiTaskType } from "./types";

export function chooseNextTaskType(streak: number, lastResult?: AiEvaluationResult): AiTaskType {
    if (!lastResult) return "translate";
    if (!lastResult.correct) return "translate";
    if (streak >= 2) return "cloze";
    return "translate";
}
