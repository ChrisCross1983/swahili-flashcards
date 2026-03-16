import { describe, expect, it } from "vitest";
import { buildMiniLesson } from "../miniLessonBuilder";

const baseTask = {
    taskId: "t1",
    cardId: "c1",
    type: "translate" as const,
    direction: "DE_TO_SW" as const,
    prompt: "Übersetze: Buch",
    expectedAnswer: "kitabu",
    meta: { resultCardPlan: { showStatus: true, showCorrectAnswer: true, showMorphology: true, showExample: true, showLearningNote: true }, nounClass: "ki/vi", plural: "vitabu" },
    profile: {
        pos: "noun" as const,
        unitType: "noun" as const,
        contextRequired: false,
        morphologicalInfo: { nounClass: "ki/vi", singular: "kitabu", plural: "vitabu" },
    },
};

const baseResult = {
    correct: false,
    intent: "wrong" as const,
    confidence: 0.5,
    errorCategory: "wrong_form" as const,
    explanation: "Die Form passt noch nicht.",
    verdict: "wrong" as const,
    score: 0,
    feedbackTitle: "Noch nicht" as const,
    correctAnswer: "kitabu",
    learnTip: "",
};

describe("miniLessonBuilder", () => {
    it("adds noun class payload when morphology is reliable", () => {
        const lesson = buildMiniLesson({ task: baseTask as never, result: baseResult as never, learnerAnswer: "vitabu" });
        expect(lesson?.grammar?.grammarFocusType).toBe("morphology_pattern");
        expect(lesson?.grammar?.nounClass).toBe("ki/vi");
        expect(lesson?.grammar?.singularForm).toBe("kitabu");
        expect(lesson?.grammar?.pluralForm).toBe("vitabu");
    });

    it("maps semantic confusion to contrast explanation", () => {
        const lesson = buildMiniLesson({
            task: { ...baseTask, profile: { ...baseTask.profile, pos: "unknown" as const } } as never,
            result: { ...baseResult, errorCategory: "semantic_confusion" } as never,
            learnerAnswer: "kalamu",
        });
        expect(lesson?.grammar?.grammarFocusType).toBe("semantic_contrast");
        expect(lesson?.grammar?.contrastPair?.learner).toBe("kalamu");
    });

    it("maps no attempt to anchor explanation even without AI", () => {
        const lesson = buildMiniLesson({
            task: baseTask as never,
            result: { ...baseResult, errorCategory: "no_attempt", explanation: "" } as never,
            learnerAnswer: "",
        });
        expect(lesson?.explanation).toContain("Kein Versuch erkannt");
    });

    it("treats greetings as fixed-expression teaching", () => {
        const lesson = buildMiniLesson({
            task: {
                ...baseTask,
                expectedAnswer: "hujambo",
                profile: { ...baseTask.profile, pos: "expression" as const, unitType: "greeting" as const, contextRequired: true, morphologicalInfo: {} },
            } as never,
            result: { ...baseResult, errorCategory: "unknown" } as never,
            learnerAnswer: "habari",
        });
        expect(lesson?.grammar?.grammarFocusType).toBe("greeting_usage");
        expect(lesson?.grammar?.usageContext).toBeDefined();
    });

    it("adds verb base-form hook for verbs", () => {
        const lesson = buildMiniLesson({
            task: {
                ...baseTask,
                expectedAnswer: "kusoma",
                profile: { ...baseTask.profile, pos: "verb" as const, unitType: "verb" as const, morphologicalInfo: { tense: "infinitive" as const } },
            } as never,
            result: { ...baseResult, errorCategory: "wrong_form" } as never,
            learnerAnswer: "soma",
        });
        expect(lesson?.grammar?.grammarFocusType).toBe("morphology_pattern");
        expect(lesson?.grammar?.verbBase).toBe("kusoma");
    });
});
