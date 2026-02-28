import { decideNextTaskType } from "./policy";
import type { AiCoachResult, AiTaskType } from "./types";

export function chooseNextTaskType(streak: number, lastResult?: AiCoachResult, history: AiTaskType[] = [], lastTaskType?: AiTaskType): AiTaskType {
    return decideNextTaskType(history, streak, lastTaskType, Boolean(lastResult?.correct));
}
