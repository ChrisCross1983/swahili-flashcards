import type { Direction } from "@/lib/trainer/types";
import type { AiCoachTask, AiTaskType } from "./types";

type SourceCard = {
    id: string;
    german_text: string;
    swahili_text: string;
};

export function buildTaskFromCard(card: SourceCard, taskType: AiTaskType, direction: Direction): AiCoachTask {
    const expectedAnswer = direction === "DE_TO_SW" ? card.swahili_text : card.german_text;
    const sourceText = direction === "DE_TO_SW" ? card.german_text : card.swahili_text;

    if (taskType === "cloze") {
        return {
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "cloze",
            direction,
            prompt: `Fülle die Lücke: ${sourceText} = ____`,
            expectedAnswer,
            hint: `Tipp: ${expectedAnswer.slice(0, 1).toUpperCase()}…`,
        };
    }

    return {
        taskId: crypto.randomUUID(),
        cardId: card.id,
        type: "translate",
        direction,
        prompt: `Übersetze: ${sourceText}`,
        expectedAnswer,
    };
}
