import type { AiCoachState, AiCoachTask, AiEvaluationResult } from "./types";

export function createInitialAiCoachState(): AiCoachState {
    return {
        sessionId: null,
        status: "idle",
        currentTask: null,
        lastResult: null,
        totalCount: 0,
        correctCount: 0,
        wrongCardIds: [],
        streak: 0,
        error: null,
    };
}

export function setLoading(state: AiCoachState): AiCoachState {
    return { ...state, status: "loading", error: null };
}

export function setTask(state: AiCoachState, payload: { sessionId?: string; task: AiCoachTask }): AiCoachState {
    return {
        ...state,
        status: "in_task",
        sessionId: payload.sessionId ?? state.sessionId,
        currentTask: payload.task,
        lastResult: null,
        error: null,
    };
}

export function setEvaluating(state: AiCoachState): AiCoachState {
    return { ...state, status: "evaluating", error: null };
}

export function setResult(state: AiCoachState, result: AiEvaluationResult): AiCoachState {
    const isWrong = !result.correct && state.currentTask?.cardId;

    return {
        ...state,
        status: "showing_result",
        lastResult: result,
        totalCount: state.totalCount + 1,
        correctCount: state.correctCount + (result.correct ? 1 : 0),
        streak: result.correct ? state.streak + 1 : 0,
        wrongCardIds: isWrong
            ? Array.from(new Set([...state.wrongCardIds, state.currentTask!.cardId]))
            : state.wrongCardIds,
    };
}

export function setError(state: AiCoachState, message: string): AiCoachState {
    return { ...state, status: "error", error: message };
}

export function finish(state: AiCoachState): AiCoachState {
    return { ...state, status: "finished" };
}
