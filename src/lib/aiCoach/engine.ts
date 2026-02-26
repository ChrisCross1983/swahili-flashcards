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
        streak: 0,
        hintLevel: 0,
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
        lastCardId: payload.task.cardId,
        lastResult: null,
        hintLevel: 0,
        error: null,
    };
}

export function setEvaluating(state: AiCoachState): AiCoachState {
    return { ...state, status: "evaluating", error: null };
}

export function setResult(state: AiCoachState, result: AiCoachResult): AiCoachState {
    const currentCardId = state.currentTask?.cardId;
    const isWrong = result.correctness !== "correct" && currentCardId;
    const answeredCardIds = currentCardId
        ? Array.from(new Set([...state.answeredCardIds, currentCardId]))
        : state.answeredCardIds;

    return {
        ...state,
        status: "showing_result",
        lastResult: result,
        totalCount: state.totalCount + 1,
        correctCount: state.correctCount + (result.correctness === "correct" ? 1 : 0),
        streak: result.correctness === "correct" ? state.streak + 1 : 0,
        answeredCardIds,
        wrongCardIds: isWrong
            ? Array.from(new Set([...state.wrongCardIds, currentCardId]))
            : state.wrongCardIds,
    };
}

export function showHint(state: AiCoachState): AiCoachState {
    const maxHints = state.currentTask?.hints?.length ?? (state.currentTask?.hint ? 1 : 0);
    if (maxHints === 0) return state;
    return { ...state, hintLevel: Math.min(state.hintLevel + 1, maxHints) };
}

export function skipTask(state: AiCoachState): AiCoachState {
    if (!state.currentTask) return state;
    return {
        ...state,
        status: "showing_result",
        lastResult: {
            correctness: "wrong",
            correctAnswer: state.currentTask.expectedAnswer,
            acceptedAnswers: state.currentTask.acceptedAnswers,
            feedback: "❌ Noch nicht.",
            why: "Du hast die Aufgabe übersprungen – schau dir die Lösung kurz an.",
            mnemonic: "Merksatz: Erst Tipp nutzen, dann erst skippen.",
            score: 0,
            suggestedNext: "repeat",
        },
        totalCount: state.totalCount + 1,
        streak: 0,
        hintLevel: 0,
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
