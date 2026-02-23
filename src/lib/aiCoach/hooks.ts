"use client";

import { useCallback, useMemo, useState } from "react";
import type { CardType, Direction } from "@/lib/trainer/types";
import { postLearnSession } from "@/lib/trainer/api";
import { evaluateAiCoachAnswer, fetchNextAiCoachTask, startAiCoachSession } from "./api";
import { createInitialAiCoachState, finish, setError, setEvaluating, setLoading, setResult, setTask, showHint, skipTask } from "./engine";
import type { AiCoachState } from "./types";

export function useAiCoachSession(cardType: CardType = "vocab", direction: Direction = "DE_TO_SW") {
    const [state, setState] = useState<AiCoachState>(createInitialAiCoachState());

    const startSession = useCallback(async () => {
        setState((prev) => setLoading(prev));
        try {
            const data = await startAiCoachSession({ type: cardType, direction });
            setState((prev) => setTask(prev, { sessionId: data.sessionId, task: data.task }));
        } catch (error) {
            setState((prev) => setError(prev, error instanceof Error ? error.message : "KI nicht verfügbar."));
        }
    }, [cardType, direction]);

    const submitAnswer = useCallback(async (answer: string) => {
        if (!state.sessionId || !state.currentTask) return;
        setState((prev) => setEvaluating(prev));

        try {
            const data = await evaluateAiCoachAnswer({
                sessionId: state.sessionId,
                task: state.currentTask,
                answer,
            });
            setState((prev) => setResult(prev, data.result));
        } catch (error) {
            setState((prev) => setError(prev, error instanceof Error ? error.message : "Bewertung fehlgeschlagen."));
        }
    }, [state.currentTask, state.sessionId]);

    const nextTask = useCallback(async () => {
        if (!state.sessionId) return;
        setState((prev) => setLoading(prev));

        try {
            const data = await fetchNextAiCoachTask({
                sessionId: state.sessionId,
                type: cardType,
                direction,
                streak: state.streak,
                lastResult: state.lastResult ?? undefined,
                wrongCardIds: state.wrongCardIds,
            });
            setState((prev) => setTask(prev, { task: data.task }));
        } catch (error) {
            setState((prev) => setError(prev, error instanceof Error ? error.message : "Nächste Aufgabe fehlgeschlagen."));
        }
    }, [cardType, direction, state.lastResult, state.sessionId, state.streak]);

    const endSession = useCallback(async () => {
        try {
            await postLearnSession({
                mode: "ai",
                totalCount: state.totalCount,
                correctCount: state.correctCount,
                wrongCardIds: state.wrongCardIds,
            });
        } catch {
            // best effort
        }

        setState((prev) => finish(prev));
    }, [state.correctCount, state.totalCount, state.wrongCardIds]);
    const revealHint = useCallback(() => {
        setState((prev) => showHint(prev));
    }, []);

    const skip = useCallback(() => {
        setState((prev) => skipTask(prev));
    }, []);

    const accuracy = useMemo(() => {
        if (state.totalCount === 0) return 0;
        return Math.round((state.correctCount / state.totalCount) * 100);
    }, [state.correctCount, state.totalCount]);

    return {
        state,
        accuracy,
        startSession,
        submitAnswer,
        revealHint,
        skip,
        nextTask,
        endSession,
    };
}
