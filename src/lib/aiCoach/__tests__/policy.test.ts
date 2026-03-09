import { describe, expect, it } from "vitest";
import { planNextTask } from "../planner";
import { createDefaultLearnerCardState } from "../learnerModel";
import { interpretCard } from "../cardInterpreter";

describe("planner", () => {
    it("wrong answers lead to support task with rationale", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        state.wrongCount = 3;
        state.lastErrorType = "wrong";

        const next = planNextTask({ learnerState: state });
        expect(next.taskType).toBe("translate");
        expect(next.difficulty).toBe("support");
        expect(next.rationale).toContain("Fehler");
    });

    it("repeated typos lead to spelling-focused translate", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        const next = planNextTask({ learnerState: state, recentIntents: ["typo", "typo", "wrong"] });
        expect(next.taskType).toBe("translate");
        expect(next.constraints.focus).toBe("spelling");
    });

    it("does not keep mcq after correct mcq when active formats are suitable", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        state.mastery = 0.1;

        const next = planNextTask({
            learnerState: state,
            recentIntents: ["correct"],
            recentTaskTypes: ["mcq", "mcq"],
            lastTaskType: "mcq",
            cardProfile: interpretCard({ id: "c1", german_text: "Buch", swahili_text: "kitabu", type: "vocab" }),
        });

        expect(next.taskType).toBe("translate");
    });

    it("moves phrase-like cards away from pure recognition", () => {
        const state = createDefaultLearnerCardState("u1", "c2");
        state.mastery = 0.2;

        const next = planNextTask({
            learnerState: state,
            cardProfile: interpretCard({ id: "c2", german_text: "Vielen Dank", swahili_text: "asante sana", type: "vocab" }),
        });

        expect(next.objective).toBe("guidedRecall");
        expect(next.taskType).toBe("translate");
    });

    it("high mastery leads to challenge without mcq fallback", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        state.mastery = 0.92;
        const next = planNextTask({ learnerState: state });
        expect(next.taskType).toBe("translate");
        expect(next.difficulty).toBe("challenge");
    });
});
