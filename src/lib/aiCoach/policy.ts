import { planNextTask } from "./planner";
import type { LearnerCardState } from "./learnerModel";
import type { AiTaskType } from "./types";

export function decideNextTaskType(state: LearnerCardState): AiTaskType {
    return planNextTask({ learnerState: state }).taskType;
}

export type ChoiceCandidate = {
    text: string;
    pos?: string | null;
    nounClass?: string | null;
};

function seededOrder(value: string): number {
    let acc = 0;
    for (const char of value) acc = (acc * 31 + char.charCodeAt(0)) % 997;
    return acc;
}

export function buildChoices(
    correct: string,
    pool: Array<string | ChoiceCandidate>,
    options?: { targetPos?: string | null; targetNounClass?: string | null },
): string[] {
    const normalizedCorrect = correct.trim().toLowerCase();
    const candidates: ChoiceCandidate[] = pool
        .map((item) => (typeof item === "string" ? { text: item } : item))
        .map((item) => ({ ...item, text: item.text.trim() }))
        .filter((item) => item.text && item.text.toLowerCase() !== normalizedCorrect)
        .filter((item) => item.text.length >= 2 && item.text.length <= 32 && !/[.!?]{2,}/.test(item.text));

    const matchingClass = candidates.filter((item) => options?.targetNounClass && item.nounClass === options.targetNounClass);
    const matchingPos = candidates.filter((item) => options?.targetPos && item.pos === options.targetPos);
    const fallback = candidates;

    const ranked = [...matchingClass, ...matchingPos, ...fallback]
        .filter((item, idx, arr) => arr.findIndex((x) => x.text.toLowerCase() === item.text.toLowerCase()) === idx)
        .sort((a, b) => seededOrder(a.text) - seededOrder(b.text))
        .slice(0, 3)
        .map((item) => item.text);

    const choices = [correct.trim(), ...ranked]
        .filter(Boolean)
        .filter((item, idx, arr) => arr.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === idx);

    return choices.slice(0, 4);
}
