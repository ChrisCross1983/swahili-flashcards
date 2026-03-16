import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateWithAi, evaluateWithHeuristic } from "../evaluator";

const task = {
    taskId: "t1",
    cardId: "c1",
    type: "translate" as const,
    direction: "DE_TO_SW" as const,
    prompt: "Übersetze: Buch",
    expectedAnswer: "kitabu",
    ui: { inputMode: "text" as const },
};

afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
});

describe("evaluateWithHeuristic", () => {
    it("classifies ich weiß nicht as skip", () => {
        const result = evaluateWithHeuristic(task, "ich weiß nicht");
        expect(result.verdict).toBe("skip");
        expect(result.intent).toBe("no_attempt");
    });

    it("detects typo-like answers", () => {
        const result = evaluateWithHeuristic(task, "kitab");
        expect(["almost", "typo"]).toContain(result.intent);
    });
});

it("maps noun-form errors to morphology-aware grammar payload", () => {
    const morphologyTask = {
        ...task,
        profile: {
            pos: "noun" as const,
            unitType: "noun" as const,
            contextRequired: false,
            morphologicalFeatures: { nounClass: "ki/vi" as const },
            morphologicalInfo: { nounClass: "ki/vi", singular: "kitabu", plural: "vitabu" },
        },
        meta: { resultCardPlan: { showStatus: true, showCorrectAnswer: true, showMorphology: true, showExample: false, showLearningNote: true }, nounClass: "ki/vi", plural: "vitabu" },
    };
    const result = evaluateWithHeuristic(morphologyTask as never, "vitabu");
    expect(["wrong_noun_class", "wrong_form", "semantic_confusion", "typo"]).toContain(result.errorCategory);
    expect(["morphology_pattern", "noun_class", "singular_plural"]).toContain(result.microLesson?.grammar?.grammarFocusType);
});

it("maps semantic confusion to contrast payload", () => {
    const result = evaluateWithHeuristic(task as never, "kalamu");
    expect(result.errorCategory).toBe("semantic_confusion");
    expect(result.microLesson?.grammar?.grammarFocusType).toBe("semantic_contrast");
});

describe("evaluateWithAi", () => {
    it("falls back when OpenAI times out", async () => {
        process.env.OPENAI_API_KEY = "test-key";
        vi.stubGlobal("fetch", () => new Promise(() => undefined));

        const fallback = evaluateWithHeuristic(task, "kitab");
        const result = await evaluateWithAi(task, "kitab", fallback);

        expect(result).toEqual(fallback);
    });
});
