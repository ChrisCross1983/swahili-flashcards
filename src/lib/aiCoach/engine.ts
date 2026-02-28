import type { AiCoachResult, AiCoachState, AiCoachTask } from "./types";

export function createInitialAiCoachState(): AiCoachState {
    return {
        sessionId: null,
        status: "idle",
        currentTask: null,
        lastResult: null,
        totalCount: 0,
        correctCount: 0,
        wrongCardIds: [],
        answeredCardIds: [],
        recentCardIds: [],
        wrongAttemptsOnCard: 0,
        streak: 0,
        hintLevel: 0,
        showExample: false,
        taskTypeHistory: [],
        error: null,
    };
}

export function setLoading(state: AiCoachState): AiCoachState {
    return { ...state, status: "loading", error: null };
}

export function setTask(state: AiCoachState, payload: { sessionId?: string; task: AiCoachTask }): AiCoachState {
    const recentCardIds = payload.task.cardId ? [...state.recentCardIds, payload.task.cardId].slice(-8) : state.recentCardIds;

    return {
        ...state,
        status: "in_task",
        sessionId: payload.sessionId ?? state.sessionId,
        currentTask: payload.task,
        lastCardId: payload.task.cardId,
        lastResult: null,
        wrongAttemptsOnCard: 0,
        hintLevel: 0,
        showExample: false,
        taskTypeHistory: [...state.taskTypeHistory, payload.task.type].slice(-12),
        recentCardIds,
        error: null,
    };
}

export function setEvaluating(state: AiCoachState): AiCoachState {
    return { ...state, status: "evaluating", error: null };
}

export function setResult(state: AiCoachState, result: AiCoachResult): AiCoachState {
    const currentCardId = state.currentTask?.cardId;
    const answeredCardIds = currentCardId ? Array.from(new Set([...state.answeredCardIds, currentCardId])) : state.answeredCardIds;
    const isWrong = !result.correct && currentCardId;

    return {
        ...state,
        status: "showing_result",
        lastResult: result,
        totalCount: state.totalCount + 1,
        correctCount: state.correctCount + (result.correct ? 1 : 0),
        streak: result.correct ? state.streak + 1 : 0,
        answeredCardIds,
        wrongAttemptsOnCard: result.correct ? 0 : state.wrongAttemptsOnCard + 1,
        wrongCardIds: isWrong ? Array.from(new Set([...state.wrongCardIds, currentCardId])) : state.wrongCardIds,
    };
}

export function retryCurrentTask(state: AiCoachState): AiCoachState {
    if (!state.currentTask) return state;
    return {
        ...state,
        status: "in_task",
        lastResult: null,
        hintLevel: Math.min(state.hintLevel + 1, 2),
        showExample: false,
    };
}

export function showHint(state: AiCoachState): AiCoachState {
    return { ...state, hintLevel: Math.min(state.hintLevel + 1, 2) };
}

export function toggleExample(state: AiCoachState): AiCoachState {
    return { ...state, showExample: !state.showExample };
}

export function skipTask(state: AiCoachState): AiCoachState {
    if (!state.currentTask) return state;
    return {
        ...state,
        status: "showing_result",
        lastResult: {
            correct: false,
            intent: "no_attempt",
            score: 0,
            feedbackTitle: "Noch nicht",
            correctAnswer: state.currentTask.expectedAnswer,
            learnTip: state.currentTask.learnTip ?? "Merktipp: Erst hören, dann laut nachsprechen.",
            example: state.currentTask.example,
            retryAllowed: true,
        },
        totalCount: state.totalCount + 1,
        streak: 0,
        hintLevel: Math.min(state.hintLevel + 1, 2),
        wrongAttemptsOnCard: state.wrongAttemptsOnCard + 1,
        answeredCardIds: Array.from(new Set([...state.answeredCardIds, state.currentTask.cardId])),
        wrongCardIds: Array.from(new Set([...state.wrongCardIds, state.currentTask.cardId])),
    };
}

export function setError(state: AiCoachState, message: string): AiCoachState {
    return { ...state, status: "error", error: message };
}

export function finish(state: AiCoachState): AiCoachState {
    return { ...state, status: "finished" };
}
