import type { AnswerIntent } from "./eval/classify";

export type LearnerCardState = {
    ownerKey: string;
    cardId: string;
    mastery: number;
    lastSeen: string | null;
    dueAt: string | null;
    wrongCount: number;
    lastErrorType: AnswerIntent | null;
    errorHistory: AnswerIntent[];
    confusionTargets: string[];
    avgLatencyMs: number;
    hintCount: number;
    confidenceEstimate: number;
    lastSuccessfulTaskType?: "translate" | "cloze" | "mcq" | null;
    lastFailedTaskType?: "translate" | "cloze" | "mcq" | null;
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

export type LearnerUpdateMeta = {
    now: Date;
    taskType?: "translate" | "cloze" | "mcq";
    usedHintLevel?: number;
    wrongAttemptsOnCard?: number;
    intent?: AnswerIntent;
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function clampMastery(value: number): number {
    return Math.max(0, Math.min(4, value));
}

function clampConfidence(value: number): number {
    return Math.max(0, Math.min(1, value));
}

export function computeMastery(state: LearnerCardState): number {
    const mastery = clampMastery(state.mastery);
    return mastery <= 1 ? mastery : mastery / 4;
}

export function isDue(state: LearnerCardState, now = new Date()): boolean {
    if (!state.dueAt) return true;
    const dueMs = new Date(state.dueAt).getTime();
    if (Number.isNaN(dueMs)) return true;
    return dueMs <= now.getTime();
}

function intervalForCorrect(mastery: number): number {
    if (mastery >= 4) return 7 * DAY_MS;
    if (mastery >= 3) return 2 * DAY_MS;
    if (mastery >= 2) return 6 * HOUR_MS;
    if (mastery >= 1) return 30 * MINUTE_MS;
    return 5 * MINUTE_MS;
}

function intervalForAlmost(mastery: number): number {
    if (mastery >= 2) return HOUR_MS;
    return 10 * MINUTE_MS;
}

function intervalForWrong(wrongAttemptsOnCard: number): number {
    return (wrongAttemptsOnCard >= 2 ? 10 : 2) * MINUTE_MS;
}

export function updateStateFromResult(
    state: LearnerCardState,
    result: LearnerResultUpdate,
    meta?: LearnerUpdateMeta,
): LearnerCardState {
    const now = meta?.now ?? result.now ?? new Date();
    const nowIso = now.toISOString();
    const prevMastery = clampMastery(state.mastery);
    const usedHintLevel = meta?.usedHintLevel ?? (result.usedHint ? 1 : 0);
    const intent = meta?.intent ?? result.intent;
    const wrongAttemptsOnCard = meta?.wrongAttemptsOnCard ?? 0;

    let mastery = prevMastery;
    let wrongCount = state.wrongCount;
    let lastErrorType: AnswerIntent | null = state.lastErrorType;
    let dueAtMs = now.getTime();
    let confidenceEstimate = clampConfidence(state.confidenceEstimate);

    if (result.correct) {
        mastery = clampMastery(prevMastery + 0.35);
        wrongCount = Math.max(0, state.wrongCount - 1);
        lastErrorType = null;
        dueAtMs = now.getTime() + intervalForCorrect(mastery);
        confidenceEstimate = clampConfidence(confidenceEstimate + 0.12);
    } else if (intent === "almost" || intent === "typo") {
        mastery = clampMastery(prevMastery + 0.15);
        lastErrorType = intent;
        dueAtMs = now.getTime() + intervalForAlmost(mastery);
        confidenceEstimate = clampConfidence(confidenceEstimate + 0.03);
    } else {
        mastery = clampMastery(prevMastery - 0.2);
        wrongCount = state.wrongCount + 1;
        lastErrorType = intent;
        dueAtMs = now.getTime() + intervalForWrong(wrongAttemptsOnCard);
        confidenceEstimate = clampConfidence(confidenceEstimate - 0.1);
    }

    return {
        ...state,
        mastery,
        lastSeen: nowIso,
        dueAt: new Date(dueAtMs).toISOString(),
        wrongCount,
        lastErrorType,
        errorHistory: [...(state.errorHistory ?? []), intent].slice(-6),
        confusionTargets: intent === "wrong" || intent === "nonsense"
            ? Array.from(new Set([...(state.confusionTargets ?? []), state.cardId])).slice(-4)
            : state.confusionTargets,
        avgLatencyMs: result.latencyMs
            ? state.avgLatencyMs > 0
                ? Math.round((state.avgLatencyMs * 0.7) + (result.latencyMs * 0.3))
                : result.latencyMs
            : state.avgLatencyMs,
        hintCount: usedHintLevel > 0 ? state.hintCount + 1 : state.hintCount,
        confidenceEstimate,
        lastSuccessfulTaskType: result.correct ? meta?.taskType ?? state.lastSuccessfulTaskType : state.lastSuccessfulTaskType,
        lastFailedTaskType: result.correct ? state.lastFailedTaskType : meta?.taskType ?? state.lastFailedTaskType,
        updatedAt: nowIso,
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
        errorHistory: [],
        confusionTargets: [],
        avgLatencyMs: 0,
        hintCount: 0,
        confidenceEstimate: 0.35,
        lastSuccessfulTaskType: null,
        lastFailedTaskType: null,
    };
}
