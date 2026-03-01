import type { CardType, Direction } from "@/lib/trainer/types";
import type { AnswerIntent } from "./eval/classify";

export type AiTaskType = "translate" | "cloze" | "mcq";

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
    meta?: {
        repeated?: boolean;
        pos?: "noun" | "verb" | "adj" | "phrase" | "unknown";
        nounClass?: string;
        plural?: string;
    };
};

export type AiCoachResult = {
    correct: boolean;
    intent: AnswerIntent;
    score: number;
    feedbackTitle: "Richtig" | "Fast richtig" | "Noch nicht";
    correctAnswer: string;
    learnTip: string;
    example?: { sw: string; de: string };
    retryAllowed?: boolean;
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
    lastTaskType?: AiTaskType;
    lastResult?: AiCoachResult;
    wrongCardIds?: string[];
    hintLevel?: number;
};

export type AiCoachNextResponse = {
    task: AiCoachTask;
    meta?: {
        repeated?: boolean;
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
    error: string | null;
};
