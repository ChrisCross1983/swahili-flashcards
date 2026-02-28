import type { AnswerIntent } from "../eval/classify";

export function isCorrectIntent(intent: AnswerIntent): boolean {
    return intent === "correct";
}
