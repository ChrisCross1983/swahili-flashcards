import type { AiCoachResult, AiTaskType } from "./types";

export function chooseNextTaskType(streak: number, lastResult?: AiCoachResult): AiTaskType {
    if (!lastResult) return "translate";
    if (lastResult.correctness !== "correct") return "translate";
    if (streak >= 2 && Math.random() < 0.7) return "cloze";
    return "translate";
}
