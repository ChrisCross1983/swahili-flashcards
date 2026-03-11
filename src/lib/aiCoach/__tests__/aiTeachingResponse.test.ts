import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTeachingResponse } from "../aiTeachingResponse";

afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
});

const task: any = {
    taskId: "t1",
    cardId: "c1",
    type: "translate" as const,
    direction: "DE_TO_SW" as const,
    prompt: "Übersetze: Buch",
    expectedAnswer: "kitabu",
    profile: { morphologyRelevant: true, morphologicalInfo: { nounClass: "ki/vi" } },
};

const fallback: any = {
    correct: false,
    intent: "wrong" as const,
    verdict: "wrong" as const,
    score: 0,
    feedbackTitle: "Noch nicht" as const,
    correctAnswer: "kitabu",
    learnTip: "",
    nextRecommendation: "repeat_same_card" as const,
};

describe("buildTeachingResponse", () => {
    it("falls back when AI output is invalid", async () => {
        process.env.OPENAI_API_KEY = "test";
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({
                output_text: JSON.stringify({
                    verdict: "wrong",
                    errorType: "wrong_form",
                    shortExplanation: "ok",
                    showMorphology: true,
                    showExample: false,
                    exampleSentence: null,
                    nounClassInfo: "ki/vi",
                    memoryHook: null,
                    nextLearningMoveRecommendation: "repeat_same_card",
                    confidence: 0.2,
                })
            }),
        })));

        const result = await buildTeachingResponse({ task, expectedAnswer: "kitabu", learnerAnswer: "kitab", hintLevel: 0, wrongAttemptsOnCard: 1, fallback });
        expect(result).toEqual(fallback);
    });
});
