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

describe("evaluateWithAi", () => {
    it("falls back when OpenAI times out", async () => {
        process.env.OPENAI_API_KEY = "test-key";
        vi.stubGlobal("fetch", () => new Promise(() => undefined));

        const fallback = evaluateWithHeuristic(task, "kitab");
        const result = await evaluateWithAi(task, "kitab", fallback);

        expect(result).toEqual(fallback);
    });
});
