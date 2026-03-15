import { isHighQualityExample } from "./contentQuality";
import { shouldUseExplanation } from "./hintQuality";
import type { AiCoachResult, AiCoachTask, ResultCardPlan } from "./types";

export type ResultCardViewModel = {
    status: "correct" | "almost" | "wrong";
    correctAnswer: string;
    morphology?: { nounClass?: string; singular?: string; plural?: string };
    example?: { sw: string; de: string };
    learningNote?: string;
    showStatus: boolean;
    showCorrectAnswer: boolean;
    showMorphology: boolean;
    showExample: boolean;
    showLearningNote: boolean;
};

function normalizePlan(task: AiCoachTask): ResultCardPlan {
    const plan = task.meta?.resultCardPlan;
    return {
        showStatus: plan?.showStatus ?? true,
        showCorrectAnswer: plan?.showCorrectAnswer ?? true,
        showMorphology: plan?.showMorphology ?? false,
        showExample: plan?.showExample ?? false,
        showLearningNote: plan?.showLearningNote ?? true,
    };
}

function getMorphology(task: AiCoachTask): { nounClass?: string; singular?: string; plural?: string } | undefined {
    if (!task.profile?.morphologyRelevant || task.profile.pos !== "noun") return undefined;

    const nounClass = (task.meta?.nounClass ?? task.profile.morphologicalInfo.nounClass)?.trim();
    const singular = task.profile.morphologicalInfo.singular?.trim();
    const plural = (task.meta?.plural ?? task.profile.morphologicalInfo.plural)?.trim();

    if (!nounClass && !singular && !plural) return undefined;
    if (!nounClass) return undefined;
    return { nounClass, singular, plural };
}

function pickExample(result: AiCoachResult, task: AiCoachTask): { sw: string; de: string } | undefined {
    const candidates = [result.example, result.microLesson?.example, task.example];
    const found = candidates.find((candidate) => isHighQualityExample(task, candidate));
    return found ? { sw: found.sw.trim(), de: found.de.trim() } : undefined;
}

function pickLearningNote(result: AiCoachResult): string | undefined {
    const candidate = result.explanation ?? result.microLesson?.explanation;
    if (!shouldUseExplanation(candidate)) return undefined;
    return candidate?.trim();
}

export function buildResultCardViewModel(result: AiCoachResult, task: AiCoachTask): ResultCardViewModel {
    const plan = normalizePlan(task);
    const status = result.correct ? "correct" : result.feedbackTitle === "Fast richtig" ? "almost" : "wrong";

    const morphology = plan.showMorphology ? getMorphology(task) : undefined;
    const example = plan.showExample ? pickExample(result, task) : undefined;
    const learningNote = plan.showLearningNote ? pickLearningNote(result) : undefined;

    return {
        status,
        correctAnswer: (result.correctAnswer || task.expectedAnswer).trim(),
        morphology,
        example,
        learningNote,
        showStatus: plan.showStatus,
        showCorrectAnswer: plan.showCorrectAnswer,
        showMorphology: Boolean(morphology),
        showExample: Boolean(example),
        showLearningNote: Boolean(learningNote),
    };
}
