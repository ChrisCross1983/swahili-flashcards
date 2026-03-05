import type { AiCoachTask } from "./types";

export type CanonicalCard = {
    id: string;
    german_text: string;
    swahili_text: string;
    type?: "vocab" | "sentence" | null;
};

export function canonicalExpectedAnswer(card: CanonicalCard, direction: AiCoachTask["direction"]): string {
    return (direction === "DE_TO_SW" ? card.swahili_text : card.german_text).trim();
}

export function resolveCanonicalTask(task: AiCoachTask, card: CanonicalCard): AiCoachTask {
    // Integrity: never trust client-provided expectedAnswer for grading.
    return {
        ...task,
        expectedAnswer: canonicalExpectedAnswer(card, task.direction),
    };
}
