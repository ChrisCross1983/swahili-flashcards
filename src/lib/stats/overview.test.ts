import { describe, expect, it } from "vitest";
import { DISPLAY_LEVELS, getDisplayLevel, getIntervalDays, getNextLevelOnWrong, MAX_LEVEL } from "@/lib/leitner";
import { countLevels, last7UtcDays, summarizeSessions, type SessionRow } from "@/lib/stats/overview";

describe("Leitner display and intervals", () => {
    it("maps all six stored levels to UI levels and keeps the cap", () => {
        expect(MAX_LEVEL).toBe(5);
        expect(DISPLAY_LEVELS).toEqual([1, 2, 3, 4, 5, 6]);
        expect(Array.from({ length: 6 }, (_, level) => getDisplayLevel(level))).toEqual(DISPLAY_LEVELS);
        expect(countLevels([0, 1, 2, 3, 4, 5])).toEqual({ "1": 1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1 });
        expect(getDisplayLevel(Math.min(MAX_LEVEL + 1, MAX_LEVEL))).toBe(6);
    });

    it("uses all intervals and resets every level to tomorrow on wrong", () => {
        expect(Array.from({ length: 6 }, (_, level) => getIntervalDays(level))).toEqual([1, 2, 6, 14, 30, 60]);
        for (let level = 0; level <= MAX_LEVEL; level += 1) {
            expect(getNextLevelOnWrong(level)).toBe(0);
            expect(getIntervalDays(getNextLevelOnWrong(level))).toBe(1);
        }
    });
});

describe("seven-day session summary", () => {
    const days = last7UtcDays(new Date("2026-11-16T23:59:59.999Z"));
    const row = (created_at: string, total_count: number, correct_count: number, wrong_card_ids: string[] = []): SessionRow =>
        ({ created_at, total_count, correct_count, wrong_card_ids });

    it("uses UTC days across month and local-time boundaries", () => {
        expect(days).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"]);
        expect(last7UtcDays(new Date("2026-11-01T00:30:00.000Z"))[0]).toBe("2026-10-26");
    });

    it("counts multiple sessions, empty days, today, single-card, all-wrong and all-correct rounds", () => {
        const summary = summarizeSessions([
            row("2026-11-09T23:59:59.999Z", 9, 9),
            row("2026-11-10T00:00:00.000Z", 1, 0, ["a"]),
            row("2026-11-10T12:00:00.000Z", 2, 2),
            row("2026-11-16T23:59:59.999Z", 3, 1, ["b"]),
        ], days);
        expect(summary.last7d[0]).toEqual({ date: "2026-11-10", sessions: 2, reviewed: 3, correct: 2, wrong: 1 });
        expect(summary.last7d[1]).toEqual({ date: "2026-11-11", sessions: 0, reviewed: 0, correct: 0, wrong: 0 });
        expect(summary.today).toEqual({ reviewed: 3, correct: 1, wrong: 2 });
        expect(summary.averages).toEqual({ accuracy: 0.5, avgWrongPerSession: 1, avgCardsPerSession: 2 });
    });

    it("does not mistake a zero-card session for a reviewed card", () => {
        const summary = summarizeSessions([row("2026-11-16T12:00:00.000Z", 0, 0)], days);
        expect(summary.today.reviewed).toBe(0);
        expect(summary.last7d[6].sessions).toBe(0);
        expect(summary.averages.accuracy).toBe(0);
    });
});
