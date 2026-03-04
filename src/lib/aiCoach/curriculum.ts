import { createDefaultLearnerCardState } from "./learnerModel";
import { planNextTask } from "./planner";
import type { AiCoachResult, AiTaskType } from "./types";

export function chooseNextTaskType(
    _streak: number,
    lastResult?: AiCoachResult,
    _history: AiTaskType[] = [],
    _lastTaskType?: AiTaskType,
    masteryLevel = 0,
): AiTaskType {
    const state = createDefaultLearnerCardState("", "");
    state.mastery = Math.max(0, Math.min(1, masteryLevel / 4));
    state.lastErrorType = lastResult?.intent && lastResult.intent !== "correct" ? lastResult.intent : null;
    return planNextTask({ learnerState: state }).taskType;
}
