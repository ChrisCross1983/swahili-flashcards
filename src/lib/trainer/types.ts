export type CardType = "vocab" | "sentence";

export type Direction = "DE_TO_SW" | "SW_TO_DE";

export type LearnMode = "LEITNER" | "DRILL";

export type TrainerStatus = "idle" | "loading" | "in_session" | "finished" | "error";

export type TodayItem = {
    cardId?: string;
    card_id?: string;
    id?: string;
    level: number;
    dueDate?: string | null;
    due_date?: string | null;
    german?: string;
    german_text?: string;
    de?: string;
    swahili?: string;
    swahili_text?: string;
    sw?: string;
    type?: CardType;
    imagePath?: string | null;
    image_path?: string | null;
    image?: string | null;
    audio_path?: string | null;
};

export type LeitnerStats = {
    total: number;
    byLevel: { level: number; label: string; count: number }[];
    dueTodayCount: number;
    dueTomorrowCount: number;
    dueLaterCount: number;
    nextDueDate: string | null;
    nextDueInDays: number | null;
};

export type SessionSummary = {
    mode: LearnMode;
    totalCount: number;
    correctCount: number;
    wrongCardIds: string[];
};

export type SetupCounts = {
    todayDue: number;
    totalCards: number;
    lastMissedCount: number;
};
