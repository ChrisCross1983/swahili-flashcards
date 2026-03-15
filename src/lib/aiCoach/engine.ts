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
        directionHistory: [],
        objectiveHistory: [],
        teachingMoveHistory: [],
        lastTeachingState: undefined,
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
        directionHistory: [...state.directionHistory, payload.task.direction].slice(-12),
        objectiveHistory: payload.task.objective ? [...state.objectiveHistory, payload.task.objective].slice(-12) : state.objectiveHistory,
        teachingMoveHistory: payload.task.teachingMove ? [...state.teachingMoveHistory, payload.task.teachingMove].slice(-12) : state.teachingMoveHistory,
        lastTeachingState: payload.task.teachingState ?? state.lastTeachingState,
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
    const maxHints = state.currentTask.hintLevels?.length ?? 1;
    return {
        ...state,
        status: "in_task",
        lastResult: null,
        hintLevel: Math.min(state.hintLevel + 1, maxHints),
        showExample: false,
    };
}

export function showHint(state: AiCoachState): AiCoachState {
    const maxHints = state.currentTask?.hintLevels?.length ?? 0;
    if (maxHints <= 0 || state.hintLevel >= maxHints) return state;
    return { ...state, hintLevel: Math.min(state.hintLevel + 1, maxHints) };
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
            confidence: 1,
            errorCategory: "no_attempt",
            explanation: "Aufgabe wurde aufgelöst; als Nächstes folgt eine gestützte Übung.",
            feedbackTitle: "Noch nicht",
            correctAnswer: state.currentTask.expectedAnswer,
            learnTip: state.currentTask.learnTip ?? "Merktipp: Erst hören, dann laut nachsprechen.",
            example: state.currentTask.example,
            retryAllowed: true,
            nextRecommendation: "repeat_same_card",
            repeatSameCard: true,
            lowerComplexity: true,
            switchToContrast: false,
            microLesson: {
                explanation: "Aufgelöst und erklärt. Du bekommst als Nächstes eine einfachere Remediation-Aufgabe.",
                morphology: state.currentTask.profile?.morphologicalInfo?.nounClass ? `Nominalklasse: ${state.currentTask.profile.morphologicalInfo.nounClass}` : undefined,
                example: state.currentTask.example,
                nextStepCue: "Jetzt dieselbe Karte geführt wiederholen.",
            },
        },
        totalCount: state.totalCount + 1,
        streak: 0,
        hintLevel: Math.min(state.hintLevel + 1, state.currentTask.hintLevels?.length ?? 1),
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
