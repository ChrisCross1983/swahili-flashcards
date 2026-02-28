import type { AiTaskType } from "./types";

function countTrailing(history: AiTaskType[], type: AiTaskType): number {
    let count = 0;
    for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i] !== type) break;
        count += 1;
    }
    return count;
}

export function decideNextTaskType(
    history: AiTaskType[] = [],
    streak = 0,
    lastTaskType?: AiTaskType,
    lastAnswerCorrect = true,
): AiTaskType {
    const recent = history.slice(-2);
    const trailingTranslate = countTrailing(history, "translate");

    if (trailingTranslate >= 2) {
        return Math.random() < 0.5 ? "mcq" : "cloze";
    }

    if (history.length >= 2 && !recent.some((t) => t === "mcq" || t === "cloze")) {
        return "mcq";
    }

    if (streak === 0 || !lastAnswerCorrect) {
        return Math.random() < 0.7 ? "mcq" : "cloze";
    }

    if (streak >= 3) {
        return lastTaskType === "cloze" ? "translate" : "cloze";
    }

    return "translate";
}

export function buildChoices(correct: string, pool: string[]): string[] {
    const normalized = correct.trim().toLowerCase();
    const candidates = Array.from(
        new Set(
            pool
                .map((item) => item.trim())
                .filter((item) => item && item.toLowerCase() !== normalized && item.length <= 40),
        ),
    );

    const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [correct, ...shuffled].sort(() => Math.random() - 0.5);
    const fallback = ["sijui", "asante", "rafiki", "chakula"].filter((item) => !options.includes(item));
    return [...options, ...fallback].slice(0, 4);
}
