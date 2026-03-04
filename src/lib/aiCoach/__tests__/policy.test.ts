import { describe, expect, it } from "vitest";
import { planNextTask } from "../planner";
import { createDefaultLearnerCardState } from "../learnerModel";

describe("planner", () => {
    it("wrong answers lead to easier mcq with rationale", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        state.wrongCount = 3;
        state.lastErrorType = "wrong";

        const next = planNextTask({ learnerState: state });
        expect(next.taskType).toBe("mcq");
        expect(next.difficulty).toBe("support");
        expect(next.rationale).toContain("Fehler");
    });

    it("repeated typos lead to spelling-focused translate", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        const next = planNextTask({ learnerState: state, recentIntents: ["typo", "typo", "wrong"] });
        expect(next.taskType).toBe("translate");
        expect(next.constraints.focus).toBe("spelling");
    });

    it("high mastery leads to recall challenge", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        state.mastery = 0.92;
        const next = planNextTask({ learnerState: state });
        expect(next.taskType).toBe("translate");
        expect(next.difficulty).toBe("challenge");
    });
});
