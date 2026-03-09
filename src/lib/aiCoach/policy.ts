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

function scoreDistractor(item: ChoiceCandidate, options?: { targetPos?: string | null; targetNounClass?: string | null }): number {
    let score = 0;
    if (options?.targetNounClass && item.nounClass === options.targetNounClass) score += 3;
    if (options?.targetPos && item.pos === options.targetPos) score += 2;
    return score;
}

function randomize<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export function buildChoices(
    correct: string,
    pool: Array<string | ChoiceCandidate>,
    options?: { targetPos?: string | null; targetNounClass?: string | null },
): string[] {
    const normalizedCorrect = correct.trim().toLowerCase();
    const correctLength = correct.trim().length;
    const candidates: ChoiceCandidate[] = pool
        .map((item) => (typeof item === "string" ? { text: item } : item))
        .map((item) => ({ ...item, text: item.text.trim() }))
        .filter((item) => item.text && item.text.toLowerCase() !== normalizedCorrect)
        .filter((item) => item.text.length >= 2 && item.text.length <= 32 && !/[.!?]{2,}/.test(item.text))
        .filter((item) => Math.abs(item.text.length - correctLength) <= 10);

    const unique = candidates.filter((item, idx, arr) => arr.findIndex((x) => x.text.toLowerCase() === item.text.toLowerCase()) === idx);
    const ranked = unique
        .map((item) => ({ item, score: scoreDistractor(item, options) }))
        .sort((a, b) => b.score - a.score || Math.abs(a.item.text.length - correctLength) - Math.abs(b.item.text.length - correctLength));

    const topBand = ranked.slice(0, 8).map((entry) => entry.item.text);
    const distractors = randomize(topBand).slice(0, 3);

    const choices = randomize([correct.trim(), ...distractors])
        .filter(Boolean)
        .filter((item, idx, arr) => arr.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === idx);

    return choices.slice(0, 4);
}
