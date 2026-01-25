"use client";

import { useSyncExternalStore } from "react";

export type TrainingContext = {
    german?: string;
    swahili?: string;
    direction?: string;
    level?: number;
    dueDate?: string;
};

let currentContext: TrainingContext | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot() {
    return currentContext;
}

export function setTrainingContext(next: TrainingContext | null) {
    currentContext = next;
    listeners.forEach((listener) => listener());
}

export function useTrainingContext() {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
