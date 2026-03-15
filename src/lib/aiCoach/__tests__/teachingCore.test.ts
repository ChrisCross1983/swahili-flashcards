import { describe, expect, it } from "vitest";
import { createDefaultLearnerCardState } from "../learnerModel";
import { planNextTask } from "../planner";
import { buildTeachingPlan } from "../teachingCore";
import { transitionTeachingState } from "../teachingStateMachine";
import { interpretCard } from "../cardInterpreter";

describe("teaching core move selection", () => {
    const profile = interpretCard({ id: "c1", german_text: "Buch", swahili_text: "kitabu", type: "vocab" });

    it("starts unknown/no-attempt items with reveal anchor", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        const plan = buildTeachingPlan({ learnerState: state, cardProfile: profile, lastResult: { correct: false, intent: "no_attempt", score: 0, feedbackTitle: "Noch nicht", correctAnswer: "kitabu", learnTip: "" } });
        expect(plan.teachingMove).toBe("reveal_anchor");
        expect(plan.objective).toBe("recognition");
    });

    it("moves recognition success toward active recall", () => {
        const next = transitionTeachingState({
            currentState: "recognition_in_progress",
            teachingMove: "recognition_check",
            correct: true,
            intent: "correct",
            confidence: 0.85,
        });
        expect(next).toBe("active_recall_in_progress");
    });

    it("maps almost-correct to guided recall via planner", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        const plan = planNextTask({
            learnerState: state,
            cardProfile: profile,
            lastResult: { correct: false, intent: "almost", score: 0.7, feedbackTitle: "Fast richtig", correctAnswer: "kitabu", learnTip: "" },
        });
        expect(plan.teachingMove).toBe("guided_recall");
    });

    it("promotes strong active recall success to transfer check", () => {
        const next = transitionTeachingState({
            currentState: "active_recall_in_progress",
            teachingMove: "active_recall",
            correct: true,
            intent: "correct",
            confidence: 0.95,
            hintLevel: 0,
        });
        expect(next).toBe("transfer_check_in_progress");
    });

    it("reduces repeated mcq when teaching progression advances", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        state.mastery = 2;
        const plan = buildTeachingPlan({
            learnerState: state,
            cardProfile: profile,
            recentTaskTypes: ["mcq", "mcq", "mcq"],
            lastResult: { correct: true, intent: "correct", confidence: 1, score: 1, feedbackTitle: "Richtig", correctAnswer: "kitabu", learnTip: "" },
        });
        expect(plan.teachingMove).toBe("active_recall");
        expect(plan.implementationTaskType).not.toBe("mcq");
    });
});
