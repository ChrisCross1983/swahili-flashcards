import { isHighQualityExample } from "./contentQuality";
import { isSpecificHintText, shouldUseExplanation } from "./hintQuality";
import type { AiCoachTask, ErrorCategory } from "./types";

export type AiTaskDesign = {
    learningObjectType: string;
    teachingObjective: string;
    taskType: "translate" | "mcq" | "cloze";
    prompt: string;
    expectedAnswer: string;
    distractors: string[];
    hint: string;
    morphologyInfoNeeded: boolean;
    exampleSentenceNeeded: boolean;
    exampleSentence: { sw: string; de: string } | null;
    explanationPlan: string;
    nextStepPlan: string;
    confidence: number;
};

export type AiTeachingResponse = {
    verdict: "correct" | "almost" | "wrong" | "skip" | "nonsense";
    errorType: ErrorCategory;
    shortExplanation: string;
    showMorphology: boolean;
    showExample: boolean;
    exampleSentence: { sw: string; de: string } | null;
    nounClassInfo: string | null;
    memoryHook: string | null;
    nextLearningMoveRecommendation: "repeat_same_card" | "lower_complexity" | "switch_to_contrast" | "advance";
    confidence: number;
};

const FILLER = [/^gut gemacht[.!]?$/i, /^versuch es weiter[.!]?$/i, /^weiter so[.!]?$/i, /^ok[.!]?$/i];

function likelySwahili(text: string): boolean {
    const lower = text.toLowerCase();
    return /(ni|wa|ki|vi|kwa|ya|za|la|na|mtu|sio|hii|hiyo|asante|karibu|habari)/.test(lower) || /[aeiou]{2}/.test(lower);
}

function likelyGerman(text: string): boolean {
    const lower = text.toLowerCase();
    return /(der|die|das|und|ich|nicht|ist|ein|eine|zum|zur|mit|für|haus|buch)/.test(lower) || /[äöüß]/.test(lower);
}

export function validateAiTaskDesign(task: AiTaskDesign, direction: AiCoachTask["direction"]): boolean {
    if (!task.prompt.trim() || !task.expectedAnswer.trim() || task.confidence < 0.45) return false;
    if (task.hint?.trim() && !isSpecificHintText(task.hint.trim())) return false;
    if (FILLER.some((rx) => rx.test(task.teachingObjective.trim()))) return false;
    if (task.taskType === "mcq") {
        if (task.distractors.length < 3) return false;
        const expectedLooksSw = likelySwahili(task.expectedAnswer);
        const expectedLooksDe = likelyGerman(task.expectedAnswer);
        const mixed = task.distractors.some((item) => {
            const sw = likelySwahili(item);
            const de = likelyGerman(item);
            if (direction === "DE_TO_SW") return de || !sw;
            if (direction === "SW_TO_DE") return sw || !de;
            return false;
        });
        if (mixed || (expectedLooksSw && expectedLooksDe)) return false;
    }

    if (task.exampleSentenceNeeded && task.exampleSentence) {
        const syntheticTask: AiCoachTask = {
            taskId: "v",
            cardId: "v",
            type: "translate",
            direction,
            prompt: task.prompt,
            expectedAnswer: task.expectedAnswer,
        };
        if (!isHighQualityExample(syntheticTask, task.exampleSentence)) return false;
    }

    return true;
}

export function validateAiTeachingResponse(response: AiTeachingResponse, task: AiCoachTask): boolean {
    if (!response.shortExplanation.trim() || response.confidence < 0.45) return false;
    if (!shouldUseExplanation(response.shortExplanation)) return false;
    if (FILLER.some((rx) => rx.test(response.shortExplanation.trim()))) return false;
    if (response.showExample && response.exampleSentence) {
        if (!isHighQualityExample(task, response.exampleSentence)) return false;
    }
    if (!task.profile?.morphologyRelevant && response.showMorphology) return false;
    return true;
}
