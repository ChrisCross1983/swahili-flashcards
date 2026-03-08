import { describe, expect, it } from "vitest";
import { interpretCard } from "../cardInterpreter";
import { buildTask } from "../tasks/generate";
import { createDefaultLearnerCardState } from "../learnerModel";
import { planNextTask } from "../planner";
import { evaluateWithHeuristic } from "../evaluator";

describe("card interpretation", () => {
    it("classifies greetings and limits unsuitable production", () => {
        const profile = interpretCard({ id: "c1", german_text: "Hallo", swahili_text: "hujambo", type: "vocab" });
        expect(profile.unitType).toBe("greeting");
        expect(profile.exerciseSuitability.production).toBe(false);
    });
});

describe("exercise suitability + generation safety", () => {
    it("does not emit cloze when sentence quality is too weak", () => {
        const task = buildTask({
            direction: "DE_TO_SW",
            objective: "guidedRecall",
            taskType: "cloze",
            card: { id: "c1", german_text: "Buch", swahili_text: "kitabu", type: "vocab" },
            enrichment: {
                owner_key: "u1",
                card_id: "c1",
                type: "vocab",
                pos: "noun",
                noun_class: "ki/vi",
                singular: "kitabu",
                plural: "vitabu",
                examples: [{ sw: "Ninapenda chai.", de: "Ich mag Tee." }],
                mnemonic: null,
                notes: "",
            },
        });
        expect(task.type).toBe("translate");
    });
});

describe("planner decisions by learner state", () => {
    it("selects repair objective for repeated mistakes", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        state.wrongCount = 3;
        const plan = planNextTask({ learnerState: state, recentIntents: ["wrong", "wrong"] });
        expect(plan.objective).toBe("repairMistake");
        expect(plan.remediationMode).toBe("intensive");
    });
});

describe("evaluator output", () => {
    const task = {
        taskId: "t1",
        cardId: "c1",
        type: "translate" as const,
        direction: "DE_TO_SW" as const,
        prompt: "Übersetze: Buch",
        expectedAnswer: "kitabu",
        ui: { inputMode: "text" as const },
    };

    it("returns error category and micro-lesson payload", () => {
        const result = evaluateWithHeuristic(task, "kitab");
        expect(result.errorCategory).toBeTypeOf("string");
        expect(result.microLesson).toBeDefined();
        expect(result.microLesson?.nextStepCue).toBeTruthy();
    });
});
