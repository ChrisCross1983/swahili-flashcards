import { decideNextTaskType } from "./policy";
import type { AiCoachResult, AiTaskType } from "./types";

export function chooseNextTaskType(
    streak: number,
    lastResult?: AiCoachResult,
    history: AiTaskType[] = [],
    lastTaskType?: AiTaskType,
    masteryLevel: 0 | 1 | 2 | 3 | 4 = 0,
): AiTaskType {
    return decideNextTaskType(history, streak, lastTaskType, Boolean(lastResult?.correct), masteryLevel);
}
