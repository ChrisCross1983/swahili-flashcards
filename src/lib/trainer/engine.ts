import type { TodayItem, TrainerStatus } from "./types";
import { resolveCardId } from "./utils";

export type TrainerState = {
    items: TodayItem[];
    index: number;
    reveal: boolean;
    status: TrainerStatus;
    lastResult?: { correct: boolean; cardId: string };
};

export function initSession(items: TodayItem[]): TrainerState {
    return {
        items,
        index: 0,
        reveal: false,
        status: items.length > 0 ? "in_session" : "finished",
    };
}

export function reveal(state: TrainerState): TrainerState {
    return { ...state, reveal: true };
}

export function findNextUnansweredIndex(items: TodayItem[], answered: Set<string>, startIndex: number): number {
    for (let i = startIndex; i < items.length; i += 1) {
        const id = resolveCardId(items[i]);
        if (!id || !answered.has(id)) return i;
    }
    return -1;
}

export function next(state: TrainerState, answered: Set<string>): TrainerState {
    const nextIndex = findNextUnansweredIndex(state.items, answered, state.index + 1);
    const fallbackIndex = nextIndex === -1 ? findNextUnansweredIndex(state.items, answered, 0) : nextIndex;

    if (fallbackIndex === -1) {
        return {
            ...state,
            reveal: false,
            status: "finished",
            items: [],
            index: 0,
        };
    }

    return {
        ...state,
        index: fallbackIndex,
        reveal: false,
    };
}

function grade(state: TrainerState, correct: boolean): TrainerState {
    const current = state.items[state.index];
    const cardId = resolveCardId(current);
    return {
        ...state,
        lastResult: cardId ? { correct, cardId } : undefined,
    };
}

export function gradeSuccess(state: TrainerState): TrainerState {
    return grade(state, true);
}

export function gradeFail(state: TrainerState): TrainerState {
    return grade(state, false);
}
