import { describe, expect, it } from "vitest";
import { createDefaultLearnerCardState, updateStateFromResult } from "../learnerModel";

describe("learnerModel.updateStateFromResult", () => {
    it("increases mastery and pushes due_at into the future on correct answer", () => {
        const now = new Date("2026-01-01T10:00:00.000Z");
        const state = createDefaultLearnerCardState("u1", "c1");
        const next = updateStateFromResult(state, { correct: true, score: 1, intent: "correct" }, { now, taskType: "translate" });

        expect(next.mastery).toBeCloseTo(0.35);
        expect(next.lastErrorType).toBeNull();
        expect(new Date(next.dueAt ?? 0).getTime()).toBeGreaterThan(now.getTime());
    });

    it("increments wrong_count and lowers mastery conservatively when wrong", () => {
        const now = new Date("2026-01-01T10:00:00.000Z");
        const state = { ...createDefaultLearnerCardState("u1", "c1"), mastery: 1.1, wrongCount: 1 };
        const next = updateStateFromResult(state, { correct: false, score: 0, intent: "wrong" }, { now, wrongAttemptsOnCard: 2, intent: "wrong" });

        expect(next.mastery).toBeCloseTo(0.9);
        expect(next.wrongCount).toBe(2);
        expect(next.lastErrorType).toBe("wrong");
        expect(new Date(next.dueAt ?? 0).toISOString()).toBe("2026-01-01T10:10:00.000Z");
    });

    it("increments hint_count when hint level is used", () => {
        const now = new Date("2026-01-01T10:00:00.000Z");
        const state = createDefaultLearnerCardState("u1", "c1");
        const next = updateStateFromResult(state, { correct: false, score: 0.8, intent: "almost" }, { now, usedHintLevel: 1, intent: "almost" });

        expect(next.hintCount).toBe(1);
        expect(next.lastErrorType).toBe("almost");
    });
});
