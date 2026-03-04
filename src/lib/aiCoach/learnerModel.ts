import type { AnswerIntent } from "./eval/classify";

export type LearnerCardState = {
    ownerKey: string;
    cardId: string;
    mastery: number;
    lastSeen: string | null;
    dueAt: string | null;
    wrongCount: number;
    lastErrorType: AnswerIntent | null;
    avgLatencyMs: number;
    hintCount: number;
    updatedAt?: string;
};

export type LearnerResultUpdate = {
    correct: boolean;
    score: number;
    intent: AnswerIntent;
    latencyMs?: number;
    usedHint?: boolean;
    now?: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeMastery(state: LearnerCardState): number {
    return Math.max(0, Math.min(1, state.mastery));
}

export function isDue(state: LearnerCardState, now = new Date()): boolean {
    if (!state.dueAt) return true;
    return new Date(state.dueAt).getTime() <= now.getTime();
}

function nextIntervalDays(mastery: number): number {
    if (mastery >= 0.9) return 8;
    if (mastery >= 0.75) return 4;
    if (mastery >= 0.5) return 2;
    return 1;
}

export function updateStateFromResult(state: LearnerCardState, result: LearnerResultUpdate): LearnerCardState {
    const now = result.now ?? new Date();
    const prevMastery = computeMastery(state);
    const score = Math.max(0, Math.min(1, result.score));
    const hintPenalty = result.usedHint ? 0.1 : 0;
    const latencyPenalty = (result.latencyMs ?? 0) > 7000 ? 0.07 : 0;
    const delta = result.correct ? (0.16 * score) - hintPenalty - latencyPenalty : -0.18;
    const mastery = Math.max(0, Math.min(1, prevMastery + delta));
    const intervalDays = result.correct ? nextIntervalDays(mastery) : 0.25;
    const dueAt = new Date(now.getTime() + (intervalDays * DAY_MS)).toISOString();

    return {
        ...state,
        mastery,
        lastSeen: now.toISOString(),
        dueAt,
        wrongCount: result.correct ? state.wrongCount : state.wrongCount + 1,
        lastErrorType: result.correct ? null : result.intent,
        avgLatencyMs: result.latencyMs
            ? state.avgLatencyMs > 0
                ? Math.round((state.avgLatencyMs * 0.7) + (result.latencyMs * 0.3))
                : result.latencyMs
            : state.avgLatencyMs,
        hintCount: result.usedHint ? state.hintCount + 1 : state.hintCount,
        updatedAt: now.toISOString(),
    };
}

export function createDefaultLearnerCardState(ownerKey: string, cardId: string): LearnerCardState {
    return {
        ownerKey,
        cardId,
        mastery: 0,
        lastSeen: null,
        dueAt: null,
        wrongCount: 0,
        lastErrorType: null,
        avgLatencyMs: 0,
        hintCount: 0,
    };
}
