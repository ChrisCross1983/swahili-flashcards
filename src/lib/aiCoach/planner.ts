import type { CardPedagogicalProfile } from "./cardInterpreter";
import type { AnswerIntent } from "./eval/classify";
import type { LearnerCardState } from "./learnerModel";
import { buildTeachingPlan } from "./teachingCore";
import type { AiCoachResult, AiTaskType, LearningObjective, TeachingMove, TeachingState } from "./types";

export type PlannerInput = {
    learnerState: LearnerCardState;
    cardProfile?: CardPedagogicalProfile;
    recentIntents?: AnswerIntent[];
    recentTaskTypes?: AiTaskType[];
    lastTaskType?: AiTaskType;
    variationSeed?: string;
    lastResult?: AiCoachResult;
    recentTeachingMoves?: TeachingMove[];
    previousTeachingState?: TeachingState;
};

export type PlannerOutput = {
    objective: LearningObjective;
    taskType: AiTaskType;
    teachingMove: TeachingMove;
    teachingState: TeachingState;
    difficulty: "support" | "standard" | "challenge";
    rationale: string;
    constraints: { focus: "spelling" | "form" | "recall" | "recognition" | "context" };
    remediationMode: "none" | "light" | "intensive";
    showExample: boolean;
    showMorphology: boolean;
    requiresAiGeneration: boolean;
    resultCardPlan: {
        showStatus: boolean;
        showCorrectAnswer: boolean;
        showMorphology: boolean;
        showExample: boolean;
        showLearningNote: boolean;
    };
};

function buildResultCardPlan(profile: CardPedagogicalProfile, objective: LearningObjective) {
    const showMorphology = profile.morphologyRelevant && (objective === "morphologyFocus" || objective === "confusionRepair" || objective === "guidedRecall");
    const showExample = profile.contextRequired && (objective === "contextUsage" || objective === "phraseMeaning" || objective === "sentenceUnderstanding");
    return {
        showStatus: true,
        showCorrectAnswer: true,
        showMorphology,
        showExample,
        showLearningNote: objective !== "recognition" || profile.exerciseSuitability.contrastLearning,
    };
}

export function planNextTask(input: PlannerInput): PlannerOutput {
    const profile = input.cardProfile ?? {
        cardType: "vocab", linguisticUnit: "word", pos: "unknown",
        unitType: "single_word", linguisticType: "unknown", semanticUse: "unknown", contextRequired: false, morphologyRelevant: false,
        morphologicalInfo: {},
        exerciseSuitability: { recognition: true, recall: true, guidedRecall: false, contextUsage: false, contrastLearning: false, production: true },
        forbiddenExerciseTypes: [], preferredExerciseTypes: ["translate"],
        explanationStrategy: "meaning_first", qualityConfidence: 0.7,
        morphologicalFeatures: {}, semanticComplexity: "simple", learningDifficulty: 2,
        exerciseCapabilities: { translation: true, recognition: true, cloze: false, production: true, contextUsage: false },
        exampleStrategy: "omit_if_low_confidence",
    };

    const teachingPlan = buildTeachingPlan({
        learnerState: input.learnerState,
        cardProfile: profile,
        recentTaskTypes: input.recentTaskTypes,
        lastTaskType: input.lastTaskType,
        lastResult: input.lastResult,
        recentTeachingMoves: input.recentTeachingMoves,
        previousTeachingState: input.previousTeachingState,
    });

    const typoStreak = (input.recentIntents ?? []).slice(-3).filter((intent) => intent === "typo").length;
    const repeatedErrors = input.learnerState.wrongCount >= 2 || input.learnerState.lastErrorType === "wrong";
    const phraseLike = profile.unitType === "phrase" || profile.unitType === "greeting" || profile.unitType === "formula";

    const effectiveMove = typoStreak >= 2
        ? "guided_recall"
        : repeatedErrors
            ? (profile.morphologyRelevant ? "morphology_focus" : "contrast_repair")
            : teachingPlan.teachingMove;
    const effectiveObjective = repeatedErrors
        ? (profile.morphologyRelevant ? "morphologyFocus" : "confusionRepair")
        : phraseLike && teachingPlan.objective === "recognition"
            ? "phraseMeaning"
            : teachingPlan.objective;
    const effectiveTaskType = effectiveMove === "recognition_check" && phraseLike
        ? "translate"
        : teachingPlan.implementationTaskType;
    const effectiveDifficulty = input.learnerState.mastery >= 0.85 && !repeatedErrors ? "challenge" : teachingPlan.difficulty;
    const effectiveRationale = repeatedErrors
        ? "Nach mehreren Fehlern folgt gezielte Reparatur mit stärkerer Führung."
        : teachingPlan.rationale;

    const focus: PlannerOutput["constraints"]["focus"] = typoStreak >= 2
        ? "spelling"
        : effectiveMove === "recognition_check" || effectiveMove === "reveal_anchor"
            ? "recognition"
            : effectiveMove === "context_focus" || effectiveMove === "transfer_check"
                ? "context"
                : effectiveMove === "morphology_focus" || effectiveMove === "contrast_repair"
                    ? "form"
                    : "recall";

    const remediationMode: PlannerOutput["remediationMode"] = effectiveMove === "morphology_focus" || effectiveMove === "contrast_repair" || effectiveMove === "reveal_anchor"
        ? "intensive"
        : effectiveMove === "guided_recall"
            ? "light"
            : "none";

    return {
        objective: effectiveObjective,
        taskType: effectiveTaskType,
        teachingMove: effectiveMove,
        teachingState: teachingPlan.teachingState,
        difficulty: effectiveDifficulty,
        rationale: effectiveRationale,
        constraints: { focus },
        remediationMode,
        showExample: buildResultCardPlan(profile, effectiveObjective).showExample,
        showMorphology: buildResultCardPlan(profile, effectiveObjective).showMorphology,
        requiresAiGeneration: teachingPlan.contextPolicy === "required" || profile.exampleStrategy === "ai_required",
        resultCardPlan: buildResultCardPlan(profile, effectiveObjective),
    };
}
