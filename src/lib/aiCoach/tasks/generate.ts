import type { Direction } from "@/lib/trainer/types";
import { buildExampleSentence } from "../examples";
import { buildHintForCard, buildLearnTipForCard, inferCardMeta } from "../hints";
import { buildChoices } from "../policy";
import type { AiCoachTask, AiTaskType } from "../types";

export type SourceCard = {
    id: string;
    german_text: string;
    swahili_text: string;
};

type GenerateTaskInput = {
    card: SourceCard;
    direction: Direction;
    taskType?: AiTaskType;
    pool?: SourceCard[];
};

function toExpected(card: SourceCard, direction: Direction): string {
    return direction === "DE_TO_SW" ? card.swahili_text : card.german_text;
}

function toPrompt(card: SourceCard, direction: Direction, taskType: AiTaskType, gapWord: string): string {
    const sourceText = direction === "DE_TO_SW" ? card.german_text : card.swahili_text;
    if (taskType === "mcq") return `Wähle die richtige Übersetzung: ${sourceText}`;
    if (taskType === "cloze") return `Wähle das passende Wort für die Lücke: ${gapWord}`;
    return `Übersetze: ${sourceText}`;
}

export function generateTask(input: GenerateTaskInput): AiCoachTask {
    const { card, direction, taskType = "translate", pool = [] } = input;
    const expectedAnswer = toExpected(card, direction);
    const example = buildExampleSentence(card, direction);
    const meta = inferCardMeta(card);

    if (taskType === "mcq") {
        const poolAnswers = pool.map((candidate) => (direction === "DE_TO_SW" ? candidate.swahili_text : candidate.german_text));
        return {
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "mcq",
            direction,
            prompt: toPrompt(card, direction, "mcq", ""),
            expectedAnswer,
            choices: buildChoices(expectedAnswer, poolAnswers),
            hint: buildHintForCard(card, direction),
            learnTip: buildLearnTipForCard(card),
            example,
            ui: { inputMode: "none", selectionMode: "mcq" },
            meta,
        };
    }

    if (taskType === "cloze") {
        const gapWord = expectedAnswer.trim() || "____";
        const sentence = example.sw.replace(gapWord, "____");
        const poolAnswers = pool.map((candidate) => (direction === "DE_TO_SW" ? candidate.swahili_text : candidate.german_text));
        return {
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "cloze",
            direction,
            prompt: toPrompt(card, direction, "cloze", sentence),
            expectedAnswer,
            choices: buildChoices(expectedAnswer, poolAnswers),
            hint: buildHintForCard(card, direction),
            learnTip: buildLearnTipForCard(card),
            example,
            ui: { inputMode: "none", selectionMode: "chips" },
            meta,
        };
    }

    return {
        taskId: crypto.randomUUID(),
        cardId: card.id,
        type: "translate",
        direction,
        prompt: toPrompt(card, direction, "translate", ""),
        expectedAnswer,
        hint: buildHintForCard(card, direction),
        learnTip: buildLearnTipForCard(card),
        example,
        ui: { inputMode: "text" },
        meta,
    };
}
