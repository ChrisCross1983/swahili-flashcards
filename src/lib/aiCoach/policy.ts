import type { AiTaskType } from "./types";

function weightedPick(options: Array<{ type: AiTaskType; weight: number }>): AiTaskType {
    const total = options.reduce((sum, item) => sum + item.weight, 0);
    let cursor = Math.random() * total;
    for (const item of options) {
        cursor -= item.weight;
        if (cursor <= 0) return item.type;
    }
    return options[options.length - 1]?.type ?? "translate";
}

function rebalanceByHistory(
    base: AiTaskType,
    history: AiTaskType[],
    lastTaskType?: AiTaskType,
): AiTaskType {
    const trailingSame = history.length > 0 && history[history.length - 1] === base;
    if (!trailingSame && lastTaskType !== base) return base;

    const alternatives = (["translate", "cloze", "mcq"] as AiTaskType[]).filter((candidate) => candidate !== base);
    if (lastTaskType && alternatives.includes(lastTaskType)) {
        const other = alternatives.find((candidate) => candidate !== lastTaskType);
        return other ?? alternatives[0] ?? base;
    }

    return alternatives[0] ?? base;
}

export function decideNextTaskType(
    history: AiTaskType[] = [],
    streak = 0,
    lastTaskType?: AiTaskType,
    lastAnswerCorrect = true,
    masteryLevel: 0 | 1 | 2 | 3 | 4 = 0,
): AiTaskType {
    let picked: AiTaskType;

    if (!lastAnswerCorrect) {
        picked = masteryLevel <= 1 ? weightedPick([{ type: "mcq", weight: 0.65 }, { type: "translate", weight: 0.25 }, { type: "cloze", weight: 0.1 }]) : weightedPick([{ type: "mcq", weight: 0.45 }, { type: "cloze", weight: 0.4 }, { type: "translate", weight: 0.15 }]);
        return rebalanceByHistory(picked, history, lastTaskType);
    }

    switch (masteryLevel) {
        case 0:
            picked = weightedPick([{ type: "mcq", weight: 0.55 }, { type: "translate", weight: 0.35 }, { type: "cloze", weight: 0.1 }]);
            break;
        case 1:
            picked = weightedPick([{ type: "translate", weight: 0.55 }, { type: "mcq", weight: 0.3 }, { type: "cloze", weight: 0.15 }]);
            break;
        case 2:
            picked = weightedPick([{ type: "cloze", weight: 0.5 }, { type: "mcq", weight: 0.3 }, { type: "translate", weight: 0.2 }]);
            break;
        case 3:
            picked = weightedPick([{ type: "translate", weight: 0.6 }, { type: "cloze", weight: 0.3 }, { type: "mcq", weight: 0.1 }]);
            break;
        case 4:
            picked = weightedPick([{ type: "cloze", weight: 0.45 }, { type: "translate", weight: 0.4 }, { type: "mcq", weight: 0.15 }]);
            break;
        default:
            picked = "translate";
    }

    if (streak >= 4 && picked === "mcq") {
        picked = masteryLevel >= 2 ? "cloze" : "translate";
    }

    return rebalanceByHistory(picked, history, lastTaskType);
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
