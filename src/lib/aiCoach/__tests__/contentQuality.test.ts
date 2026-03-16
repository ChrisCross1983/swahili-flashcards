import { describe, expect, it } from "vitest";
import { isHighQualityExample, shouldShowHint } from "../contentQuality";
import { buildResultCardViewModel } from "../solutionCardBuilder";

const nounTask = {
    taskId: "t1",
    cardId: "c1",
    type: "translate" as const,
    direction: "DE_TO_SW" as const,
    prompt: "Übersetze: Buch",
    expectedAnswer: "kitabu",
    profile: {
        pos: "noun" as const,
        morphologyRelevant: true,
        morphologicalInfo: { nounClass: "ki/vi", singular: "kitabu", plural: "vitabu" },
    },
    meta: {
        nounClass: "ki/vi",
        plural: "vitabu",
        resultCardPlan: {
            showStatus: true,
            showCorrectAnswer: true,
            showMorphology: true,
            showExample: true,
            showLearningNote: true,
        },
    },
    ui: { inputMode: "text" as const },
};

describe("contentQuality", () => {
    it("rejects generic template examples", () => {
        expect(isHighQualityExample(nounTask, { sw: "Im Gespräch sage ich kitabu oft.", de: "Im Gespräch sage ich Buch oft." })).toBe(false);
    });

    it("accepts plausible examples with sw+de", () => {
        expect(isHighQualityExample(nounTask, { sw: "Ninununua kitabu kipya leo.", de: "Ich kaufe heute ein neues Buch." })).toBe(true);
    });

    it("shows only compact specific hint for almost-correct", () => {
        expect(shouldShowHint({ feedbackTitle: "Fast richtig", learnTip: "Erster Buchstabe: k." } as never)).toBe(true);
        expect(shouldShowHint({ feedbackTitle: "Fast richtig", learnTip: "Plural: vitabu." } as never)).toBe(false);
    });

    it("result card always includes status + correct answer", () => {
        const vm = buildResultCardViewModel({ correct: false, feedbackTitle: "Noch nicht", correctAnswer: "kitabu" } as never, nounTask as never);
        expect(vm.showStatus).toBe(true);
        expect(vm.showCorrectAnswer).toBe(true);
        expect(vm.correctAnswer).toBe("kitabu");
    });

    it("shows morphology only for morphology-relevant nouns", () => {
        const vm = buildResultCardViewModel({ correct: true, feedbackTitle: "Richtig", correctAnswer: "kitabu" } as never, nounTask as never);
        expect(vm.morphology).toEqual({ nounClass: "ki/vi", singular: "kitabu", plural: "vitabu" });

        const plainTask = { ...nounTask, profile: { ...nounTask.profile, morphologyRelevant: false, pos: "verb" } };
        const plainVm = buildResultCardViewModel({ correct: true, feedbackTitle: "Richtig", correctAnswer: "kitabu" } as never, plainTask as never);
        expect(plainVm.morphology).toBeUndefined();
    });

    it("shows grammar block when mini-lesson has grammar payload", () => {
        const vm = buildResultCardViewModel({
            correct: false,
            feedbackTitle: "Noch nicht",
            correctAnswer: "kitabu",
            microLesson: {
                grammar: {
                    grammarFocusType: "noun_class",
                    keyPattern: "ki- im Singular, vi- im Plural",
                },
            },
        } as never, nounTask as never);
        expect(vm.showGrammar).toBe(true);
        expect(vm.grammar?.grammarFocusType).toBe("noun_class");
    });

    it("omits weak example and generic learning note", () => {
        const vm = buildResultCardViewModel({
            correct: false,
            feedbackTitle: "Noch nicht",
            correctAnswer: "kitabu",
            example: { sw: "Wir sagen kitabu oft", de: "Wir sagen Buch oft" },
            explanation: "Antwort passt noch nicht.",
        } as never, nounTask as never);

        expect(vm.example).toBeUndefined();
        expect(vm.learningNote).toBeUndefined();
    });
});
