import { useCallback, useMemo, useState } from "react";
import {
    fetchTodayItems,
    postGrade,
    postLastMissed,
} from "./api";
import { gradeFail, gradeSuccess, initSession, next, reveal as revealState } from "./engine";
import type { CardType, TodayItem } from "./types";
import { resolveCardId, shuffleArray } from "./utils";

export function useTrainerSession({ cardType }: { cardType: CardType }) {
    const [items, setItems] = useState<TodayItem[]>([]);
    const [index, setIndex] = useState(0);
    const [reveal, setReveal] = useState(false);
    const [status, setStatus] = useState<"idle" | "loading" | "in_session" | "finished" | "error">("idle");
    const [error, setError] = useState<string | null>(null);

    const startSession = useCallback(async () => {
        setStatus("loading");
        setError(null);
        try {
            const loaded = await fetchTodayItems(cardType);
            const session = initSession(shuffleArray(loaded));
            setItems(session.items);
            setIndex(session.index);
            setReveal(session.reveal);
            setStatus(session.status);
            return session.items;
        } catch (e) {
            setStatus("error");
            setError(e instanceof Error ? e.message : "Session konnte nicht gestartet werden.");
            setItems([]);
            return [];
        }
    }, [cardType]);

    const onReveal = useCallback(() => {
        const session = revealState({ items, index, reveal, status });
        setReveal(session.reveal);
    }, [items, index, reveal, status]);

    const onGrade = useCallback(async (correct: boolean, answered: Set<string>) => {
        const base = { items, index, reveal, status };
        const graded = correct ? gradeSuccess(base) : gradeFail(base);

        const cardId = resolveCardId(items[index]);
        if (cardId) {
            if (!correct) await postLastMissed("add", cardId);
            await postGrade({ cardId, correct, currentLevel: Number(items[index]?.level ?? 0) });
        }

        const transitioned = next(graded, answered);
        setItems(transitioned.items);
        setIndex(transitioned.index);
        setReveal(transitioned.reveal);
        setStatus(transitioned.status);
    }, [items, index, reveal, status]);

    const currentItem = items[index] ?? null;

    const progress = useMemo(() => ({
        index: items.length === 0 ? 0 : index + 1,
        total: items.length,
    }), [index, items.length]);

    return {
        state: { items, index, reveal, status, error },
        currentItem,
        progress,
        actions: { startSession, onReveal, onGrade },
    };
}
