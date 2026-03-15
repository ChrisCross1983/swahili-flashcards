import type { CardType, Direction } from "@/lib/trainer/types";
import type { AnswerIntent } from "./eval/classify";
import type { CardPedagogicalProfile } from "./cardInterpreter";

export type LearningObjective =
    | "recognition"
    | "recall"
    | "guidedRecall"
    | "morphologyFocus"
    | "contextUsage"
    | "confusionRepair"
    | "phraseMeaning"
    | "sentenceUnderstanding";

export type ErrorCategory =
    | "typo"
    | "wrong_form"
    | "wrong_noun_class"
    | "wrong_word_order"
    | "semantic_confusion"
    | "no_attempt"
    | "unknown";

export type AiTaskType = "translate" | "cloze" | "mcq";

export type TeachingMove =
    | "reveal_anchor"
    | "recognition_check"
    | "guided_recall"
    | "active_recall"
    | "morphology_focus"
    | "context_focus"
    | "contrast_repair"
    | "transfer_check"
    | "production_check"
    | "revisit_due_item";

export type TeachingState =
    | "unknown"
    | "just_revealed"
    | "recognition_in_progress"
    | "guided_recall_in_progress"
    | "active_recall_in_progress"
    | "transfer_check_in_progress"
    | "stabilized"
    | "remediation_needed";

export type ResultCardPlan = {
    showStatus: boolean;
    showCorrectAnswer: boolean;
    showMorphology: boolean;
    showExample: boolean;
    showLearningNote: boolean;
};

export type AiCoachTask = {
    taskId: string;
    cardId: string;
    type: AiTaskType;
    direction: Direction;
    prompt: string;
    expectedAnswer: string;
    choices?: string[];
    learnTip?: string;
    example?: { sw: string; de: string };
    hintLevels?: string[];
    ui?: {
        inputMode: "text" | "mcq" | "cloze_click";
    };
    objective?: LearningObjective;
    teachingMove?: TeachingMove;
    teachingState?: TeachingState;
    rationale?: string;
    profile?: CardPedagogicalProfile;
    meta?: {
        repeated?: boolean;
        pos?: "noun" | "verb" | "adj" | "phrase" | "unknown";
        nounClass?: string;
        plural?: string;
        resultCardPlan?: {
            showStatus: boolean;
            showCorrectAnswer: boolean;
            showMorphology: boolean;
            showExample: boolean;
            showLearningNote: boolean;
        };
    };
};

export type AiCoachResult = {
    correct: boolean;
    intent: AnswerIntent;
    confidence?: number;
    errorCategory?: ErrorCategory;
    explanation?: string;
    verdict?: "correct" | "almost" | "wrong" | "skip" | "nonsense";
    score: number;
    feedbackTitle: "Richtig" | "Fast richtig" | "Noch nicht";
    feedback?: string;
    correctAnswer: string;
    learnTip: string;
    example?: { sw: string; de: string };
    suggestedNext?: "repeat" | "next" | "easier" | "harder";
    retryAllowed?: boolean;
    nextRecommendation?: "repeat_same_card" | "lower_complexity" | "switch_to_contrast" | "advance";
    repeatSameCard?: boolean;
    lowerComplexity?: boolean;
    switchToContrast?: boolean;
    microLesson?: {
        explanation?: string;
        morphology?: string;
        example?: { sw: string; de: string };
        memoryHook?: string;
        nextStepCue?: string;
    };
    nextTeachingMove?: TeachingMove;
    nextTeachingState?: TeachingState;
};

export type AiCoachStartInput = {
    type: CardType;
    level?: "beginner" | "intermediate";
    direction?: Direction;
};

export type AiCoachStartResponse = {
    sessionId: string;
    task: AiCoachTask;
};

export type AiCoachEvaluateInput = {
    sessionId: string;
    task: AiCoachTask;
    answer: string;
    hintLevel?: number;
    wrongAttemptsOnCard?: number;
};

export type AiCoachEvaluateResponse = {
    result: AiCoachResult;
};

export type AiCoachNextInput = {
    sessionId: string;
    type: CardType;
    direction: Direction;
    streak: number;
    excludeCardId?: string;
    answeredCardIds?: string[];
    recentCardIds?: string[];
    history?: AiTaskType[];
    recentDirections?: Direction[];
    recentObjectives?: LearningObjective[];
    recentTeachingMoves?: TeachingMove[];
    lastTeachingState?: TeachingState;
    lastTaskType?: AiTaskType;
    lastResult?: AiCoachResult;
    wrongCardIds?: string[];
    hintLevel?: number;
};

export type AiCoachNextResponse = {
    task: AiCoachTask;
    meta?: {
        repeated?: boolean;
        objective?: LearningObjective;
        teachingMove?: TeachingMove;
        teachingState?: TeachingState;
        rationale?: string;
    };
};

export type AiCoachStatus =
    | "idle"
    | "loading"
    | "in_task"
    | "evaluating"
    | "showing_result"
    | "finished"
    | "error";

export type AiCoachState = {
    sessionId: string | null;
    status: AiCoachStatus;
    currentTask: AiCoachTask | null;
    lastResult: AiCoachResult | null;
    totalCount: number;
    correctCount: number;
    wrongCardIds: string[];
    answeredCardIds: string[];
    recentCardIds: string[];
    wrongAttemptsOnCard: number;
    lastCardId?: string;
    streak: number;
    hintLevel: number;
    showExample: boolean;
    taskTypeHistory: AiTaskType[];
    directionHistory: Direction[];
    objectiveHistory: LearningObjective[];
    teachingMoveHistory: TeachingMove[];
    lastTeachingState?: TeachingState;
    error: string | null;
};
