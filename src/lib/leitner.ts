export const LEITNER_INTERVAL_DAYS = [1, 2, 6, 14, 30, 60] as const;
export const MAX_LEVEL = LEITNER_INTERVAL_DAYS.length - 1;

export function getIntervalDays(level: number): number {
    const safeLevel = Number.isFinite(level) ? Math.floor(level) : 0;
    const clamped = Math.min(Math.max(safeLevel, 0), MAX_LEVEL);
    return LEITNER_INTERVAL_DAYS[clamped] ?? LEITNER_INTERVAL_DAYS[0];
}

export function formatDays(days: number): string {
    const safeDays = Number.isFinite(days) ? Math.round(days) : 0;
    if (safeDays <= 0) return "heute";
    if (safeDays === 1) return "morgen";
    return `in ${safeDays} Tagen`;
}

export function getNextLevelOnWrong(_currentLevel: number): number {
    return 0;
}