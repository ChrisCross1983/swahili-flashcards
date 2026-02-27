import type { Direction } from "@/lib/trainer/types";
import type { AiCoachTask } from "../types";
import { buildExampleSentence } from "./exampleSentence";
import { buildMcqChoices } from "./mcq";

export type SourceCard = {
    id: string;
    german_text: string;
    swahili_text: string;
};

type GenerateTaskInput = {
    card: SourceCard;
    direction: Direction;
    forceMcq?: boolean;
    hintLevel?: number;
    pool?: SourceCard[];
};

function parseAcceptedAnswers(value: string): string[] {
    return value
        .split(/[\/,]/)
        .map((part) => part.trim())
        .filter(Boolean);
}

export function generateTask(input: GenerateTaskInput): AiCoachTask {
    const { card, direction, forceMcq = false, hintLevel = 0, pool = [] } = input;
    const expectedAnswer = direction === "DE_TO_SW" ? card.swahili_text : card.german_text;
    const sourceText = direction === "DE_TO_SW" ? card.german_text : card.swahili_text;
    const acceptedAnswers = parseAcceptedAnswers(expectedAnswer);
    const exampleSentence = buildExampleSentence({ swahili: card.swahili_text, german: card.german_text });

    if (forceMcq || hintLevel >= 3) {
        const directionAwarePool = pool.map((candidate) => ({
            id: candidate.id,
            answer: direction === "DE_TO_SW" ? candidate.swahili_text : candidate.german_text,
        }));

        return {
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "mcq",
            direction,
            prompt: `Wähle die richtige Übersetzung: ${sourceText}`,
            expectedAnswer,
            acceptedAnswers,
            choices: buildMcqChoices(expectedAnswer, directionAwarePool),
            exampleSentence,
        };
    }

    if (Math.random() < 0.3 && exampleSentence) {
        const gap = acceptedAnswers[0] ?? expectedAnswer;
        return {
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "cloze",
            direction,
            prompt: `Fülle die Lücke: ${exampleSentence.replace(gap, "____")}`,
            expectedAnswer,
            acceptedAnswers,
            exampleSentence,
        };
    }

    return {
        taskId: crypto.randomUUID(),
        cardId: card.id,
        type: "translate",
        direction,
        prompt: `Übersetze: ${sourceText}`,
        expectedAnswer,
        acceptedAnswers,
        exampleSentence,
    };
}
