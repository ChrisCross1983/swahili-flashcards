import { describe, expect, it } from "vitest";
import { classifyAnswerIntent } from "../eval/classify";
import { evaluateWithHeuristic } from "../evaluator";
import { computeSimilarityScore, levenshtein } from "../eval/similarity";

describe("classifyAnswerIntent", () => {
    it("detects no_attempt", () => {
        expect(classifyAnswerIntent("keine ahnung", "sungura").intent).toBe("no_attempt");
    });

    it("detects typo", () => {
        expect(classifyAnswerIntent("sungur", "sungura").intent).toBe("typo");
    });

    it("detects correct", () => {
        expect(classifyAnswerIntent("Sungura", "sungura").intent).toBe("correct");
    });

    it("detects nonsense", () => {
        expect(classifyAnswerIntent("*", "sungura").intent).toBe("nonsense");
    });
});

describe("similarity helpers", () => {
    it("computes levenshtein", () => {
        expect(levenshtein("kitabu", "kitabu")).toBe(0);
        expect(levenshtein("kitabu", "kitabo")).toBe(1);
    });

    it("computes similarity score", () => {
        expect(computeSimilarityScore("kitabu", "kitabu")).toBe(1);
        expect(computeSimilarityScore("kitabu", "banana")).toBeLessThan(0.4);
    });
});


describe("evaluateWithHeuristic", () => {
    it("marks keine ahnung as incorrect with supportive feedback", () => {
        const result = evaluateWithHeuristic({
            taskId: "t1",
            cardId: "c1",
            type: "translate",
            direction: "DE_TO_SW",
            prompt: "Übersetze",
            expectedAnswer: "kitabu",
            learnTip: "Nutze es im Satz.",
            example: { sw: "Hii ni kitabu.", de: "Das ist ein Buch." },
            ui: { inputMode: "text" },
        }, "keine ahnung");

        expect(result.correct).toBe(false);
        expect(result.intent).toBe("no_attempt");
        expect(result.learnTip).toContain("Alles gut");
    });
});
