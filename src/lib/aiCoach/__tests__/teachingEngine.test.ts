import { describe, expect, it } from "vitest";
import { interpretCard } from "../cardInterpreter";
import { buildTask } from "../tasks/generate";
import { createDefaultLearnerCardState } from "../learnerModel";
import { planNextTask } from "../planner";
import { evaluateWithHeuristic } from "../evaluator";

describe("card interpretation", () => {
    it("classifies greetings and limits unsuitable cloze", () => {
        const profile = interpretCard({ id: "c1", german_text: "Hallo", swahili_text: "hujambo", type: "vocab" });
        expect(profile.unitType).toBe("greeting");
        expect(profile.forbiddenExerciseTypes).toContain("cloze");
        expect(profile.contextRequired).toBe(true);
    });

    it("classifies sentence cards as full_sentence", () => {
        const profile = interpretCard({ id: "c2", german_text: "Das ist eine Banane", swahili_text: "Hili ni ndizi.", type: "sentence" });
        expect(profile.unitType).toBe("full_sentence");
        expect(profile.exerciseSuitability.recognition).toBe(false);
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

    it("prepares result-card fields for phrase-meaning objective", () => {
        const task = buildTask({
            direction: "DE_TO_SW",
            objective: "phraseMeaning",
            card: { id: "c9", german_text: "Guten Morgen", swahili_text: "habari za asubuhi", type: "vocab" },
        });
        expect(task.meta?.resultCardPlan?.includeUsageContext).toBe(true);
    });
});

describe("planner decisions by learner state", () => {
    it("selects confusion/morphology repair objective for repeated mistakes", () => {
        const state = createDefaultLearnerCardState("u1", "c1");
        state.wrongCount = 3;
        const plan = planNextTask({ learnerState: state, recentIntents: ["wrong", "wrong"] });
        expect(["confusionRepair", "morphologyFocus"]).toContain(plan.objective);
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
        meta: { resultCardPlan: { includeCorrectAnswer: true, includeMorphology: true, includeExample: false, includeContrastNote: false, includeUsageContext: false } },
        profile: { morphologicalInfo: { nounClass: "ki/vi", singular: "kitabu", plural: "vitabu" }, contextRequired: false },
    };

    it("returns relevant micro-lesson payload without generic filler", () => {
        const result = evaluateWithHeuristic(task as never, "kitab");
        expect(result.microLesson?.morphology).toContain("Nominalklasse");
        expect(result.microLesson?.example).toBeUndefined();
    });
});
