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

export type SessionAfterDeletion = {
    items: TodayItem[];
    index: number;
    reveal: boolean;
    deletedCurrent: boolean;
    ended: boolean;
};

export function removeDeletedCardsFromSession(
    items: TodayItem[],
    index: number,
    reveal: boolean,
    deletedCardIds: Set<string>,
): SessionAfterDeletion {
    if (deletedCardIds.size === 0) {
        return {
            items,
            index: Math.max(0, Math.min(index, Math.max(0, items.length - 1))),
            reveal,
            deletedCurrent: false,
            ended: items.length === 0,
        };
    }

    const deletedIndexes = new Set<number>();
    const remaining: TodayItem[] = [];
    items.forEach((item, itemIndex) => {
        const cardId = resolveCardId(item);
        if (cardId && deletedCardIds.has(cardId)) {
            deletedIndexes.add(itemIndex);
            return;
        }
        remaining.push(item);
    });

    if (remaining.length === 0) {
        return {
            items: [],
            index: 0,
            reveal: false,
            deletedCurrent: deletedIndexes.has(index),
            ended: true,
        };
    }

    const deletedCurrent = deletedIndexes.has(index);
    if (deletedCurrent) {
        return {
            items: remaining,
            index: Math.min(index, remaining.length - 1),
            reveal: false,
            deletedCurrent: true,
            ended: false,
        };
    }

    const removedBeforeCurrent = Array.from(deletedIndexes).filter((itemIndex) => itemIndex < index).length;
    return {
        items: remaining,
        index: Math.max(0, index - removedBeforeCurrent),
        reveal,
        deletedCurrent: false,
        ended: false,
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
