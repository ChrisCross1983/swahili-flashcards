import { describe, expect, it } from "vitest";
import { buildResultCardViewModel, getVisibleMorphology, isHighQualityExample, pickVisibleExample, shouldShowHint } from "../contentQuality";

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
            includeCorrectAnswer: true,
            includeMorphology: true,
            includeExample: true,
            includeContrastNote: false,
            includeUsageContext: true,
            includeExplanation: true,
            includeNextStep: true,
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

    it("only exposes hint for almost-correct compact hints", () => {
        expect(shouldShowHint({ feedbackTitle: "Fast richtig", learnTip: "Prüfe die Endung." } as never)).toBe(true);
        expect(shouldShowHint({ feedbackTitle: "Noch nicht", learnTip: "Prüfe die Endung." } as never)).toBe(false);
    });

    it("returns noun morphology only when available", () => {
        const morphology = getVisibleMorphology(nounTask as never);
        expect(morphology).toEqual({ nounClass: "ki/vi", singular: "kitabu", plural: "vitabu" });
    });

    it("prefers high-quality examples only", () => {
        const result = {
            feedbackTitle: "Noch nicht",
            example: { sw: "Wir sagen kitabu oft", de: "Wir sagen Buch oft" },
            microLesson: { example: { sw: "Ninapata kitabu mezani.", de: "Ich finde ein Buch auf dem Tisch." } },
        };
        const picked = pickVisibleExample(result as never, nounTask as never);
        expect(picked?.sw).toContain("Ninapata");
    });

    it("result card always includes status + correct answer", () => {
        const vm = buildResultCardViewModel({ correct: false, feedbackTitle: "Noch nicht", correctAnswer: "kitabu" } as never, nounTask as never);
        expect(vm.status).toBe("wrong");
        expect(vm.correctAnswer).toBe("kitabu");
    });

    it("hides explanation and next step when generic", () => {
        const vm = buildResultCardViewModel({
            correct: false,
            feedbackTitle: "Noch nicht",
            correctAnswer: "kitabu",
            explanation: "Warum es noch nicht passt",
            microLesson: { nextStepCue: "Weiter so" },
        } as never, nounTask as never);

        expect(vm.explanation).toBeUndefined();
        expect(vm.nextStepCue).toBeUndefined();
    });

    it("hides example when low quality", () => {
        const vm = buildResultCardViewModel({
            correct: false,
            feedbackTitle: "Noch nicht",
            correctAnswer: "kitabu",
            example: { sw: "Wir sagen kitabu oft", de: "Wir sagen Buch oft" },
        } as never, nounTask as never);

        expect(vm.example).toBeUndefined();
    });

    it("hides morphology for non-morphology items", () => {
        const plainTask = {
            ...nounTask,
            profile: { ...nounTask.profile, morphologyRelevant: false, pos: "verb" },
        };
        const vm = buildResultCardViewModel({ correct: true, feedbackTitle: "Richtig", correctAnswer: "kitabu" } as never, plainTask as never);
        expect(vm.morphology).toBeUndefined();
    });
});
