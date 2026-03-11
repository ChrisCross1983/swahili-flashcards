import { afterEach, describe, expect, it, vi } from "vitest";
import { designTaskWithAi } from "../aiTaskDesigner";

afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
});

describe("designTaskWithAi", () => {
    it("returns null on invalid AI content for safe fallback", async () => {
        process.env.OPENAI_API_KEY = "test";
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({
                output_text: JSON.stringify({
                    learningObjectType: "recognition",
                    teachingObjective: "Weiter so",
                    taskType: "mcq",
                    prompt: "Wähle",
                    expectedAnswer: "kitabu",
                    distractors: ["Haus", "Buch", "Freund"],
                    hint: "",
                    morphologyInfoNeeded: false,
                    exampleSentenceNeeded: false,
                    exampleSentence: null,
                    explanationPlan: "",
                    nextStepPlan: "",
                    confidence: 0.9,
                })
            }),
        })));

        const designed = await designTaskWithAi({
            task: { taskId: "t1", cardId: "c1", type: "translate", direction: "DE_TO_SW", prompt: "Übersetze", expectedAnswer: "kitabu" },
            card: { german_text: "Buch", swahili_text: "kitabu", type: "vocab" },
            learnerState: { ownerKey: "u", cardId: "c1", mastery: 0.3, lastSeen: null, dueAt: null, wrongCount: 1, lastErrorType: null, errorHistory: [], confusionTargets: [], avgLatencyMs: 0, hintCount: 0, confidenceEstimate: 0.4, lastSuccessfulTaskType: null, lastFailedTaskType: null },
            recentTaskHistory: [],
            recentOutcomes: [],
            allowedUiCapabilities: ["text", "mcq", "cloze_click"],
        });

        expect(designed).toBeNull();
    });
});
