import type { CardType, Direction } from "@/lib/trainer/types";

export type AiTaskType = "translate" | "cloze";

export type AiCoachTask = {
    taskId: string;
    cardId: string;
    type: AiTaskType;
    direction: Direction;
    prompt: string;
    expectedAnswer: string;
    acceptedAnswers?: string[];
    hint?: string;
    hints?: string[];
    meta?: { source?: "vocab" | "sentence" | "template"; difficulty?: "easy" | "medium"; repeated?: boolean };
};

export type AiCoachResult = {
    correctness: "correct" | "almost" | "wrong";
    correctAnswer: string;
    acceptedAnswers?: string[];
    feedback: string;
    why?: string;
    mnemonic?: string;
    score?: number;
    suggestedNext: "translate" | "cloze" | "repeat";
};

export type AiCoachSessionStats = {
    totalCount: number;
    correctCount: number;
    wrongCardIds: string[];
    streak: number;
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
    lastResult?: AiCoachResult;
    wrongCardIds?: string[];
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
    lastCardId?: string;
    streak: number;
    hintLevel: number;
    error: string | null;
};
