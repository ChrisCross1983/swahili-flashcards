import { DISPLAY_LEVELS, getDisplayLevel } from "@/lib/leitner";

export type SessionRow = {
    total_count: number | null;
    correct_count: number | null;
    wrong_card_ids: string[] | null;
    created_at: string;
};

export function last7UtcDays(now: Date): string[] {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Array.from({ length: 7 }, (_, index) => new Date(today - (6 - index) * 86_400_000).toISOString().slice(0, 10));
}

export function countLevels(levels: number[]): Record<string, number> {
    const counts = Object.fromEntries(DISPLAY_LEVELS.map((level) => [String(level), 0])) as Record<string, number>;
    for (const level of levels) counts[String(getDisplayLevel(level))] += 1;
    return counts;
}

export function summarizeSessions(rows: SessionRow[], days: string[]) {
    const buckets = new Map(days.map((date) => [date, { date, sessions: 0, reviewed: 0, correct: 0, wrong: 0 }]));
    for (const row of rows) {
        const bucket = buckets.get(row.created_at.slice(0, 10));
        if (!bucket) continue;
        const reviewed = Math.max(0, Number(row.total_count) || 0);
        if (reviewed === 0) continue;
        const correct = Math.min(reviewed, Math.max(0, Number(row.correct_count) || 0));
        bucket.sessions += 1;
        bucket.reviewed += reviewed;
        bucket.correct += correct;
        bucket.wrong += reviewed - correct;
    }
    const last7d = days.map((day) => buckets.get(day)!);
    const today = last7d[last7d.length - 1];
    const sessions = last7d.reduce((sum, day) => sum + day.sessions, 0);
    const reviewed = last7d.reduce((sum, day) => sum + day.reviewed, 0);
    const correct = last7d.reduce((sum, day) => sum + day.correct, 0);
    const wrong = reviewed - correct;
    return {
        today: { reviewed: today.reviewed, correct: today.correct, wrong: today.wrong },
        last7d,
        averages: {
            accuracy: reviewed > 0 ? correct / reviewed : 0,
            avgWrongPerSession: sessions > 0 ? wrong / sessions : 0,
            avgCardsPerSession: sessions > 0 ? reviewed / sessions : 0,
        },
    };
}
