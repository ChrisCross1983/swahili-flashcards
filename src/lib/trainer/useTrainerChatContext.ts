import { useEffect, useMemo } from "react";
import { setTrainingContext } from "@/lib/aiContext";
import type { Direction } from "@/lib/trainer/types";

type UseTrainerChatContextParams = {
    currentGerman?: string | null;
    currentSwahili?: string | null;
    direction: Direction;
    currentLevel: number;
    currentDueDate?: string | null;
};

export function useTrainerChatContext({
    currentGerman,
    currentSwahili,
    direction,
    currentLevel,
    currentDueDate,
}: UseTrainerChatContextParams) {
    const chatContextPayload = useMemo(
        () => ({
            german: currentGerman || undefined,
            swahili: currentSwahili || undefined,
            direction,
            level: Number.isFinite(currentLevel) ? currentLevel : undefined,
            dueDate: currentDueDate ?? undefined,
        }),
        [currentGerman, currentSwahili, direction, currentLevel, currentDueDate],
    );

    useEffect(() => {
        setTrainingContext(chatContextPayload);
        return () => setTrainingContext(null);
    }, [chatContextPayload]);
}
