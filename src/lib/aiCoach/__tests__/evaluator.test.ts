import { describe, expect, it } from "vitest";
import { evaluateWithHeuristic } from "../evaluator";
import type { AiCoachTask } from "../types";

const task: AiCoachTask = {
    taskId: "t1",
    cardId: "c1",
    type: "translate",
    direction: "DE_TO_SW",
    prompt: "Übersetze: Haus",
    expectedAnswer: "nyumba",
};

const longTask: AiCoachTask = {
    ...task,
    taskId: "t2",
    expectedAnswer: "ninakunywa",
};

describe("evaluator", () => {
    it("exact match => correct", () => {
        const result = evaluateWithHeuristic(task, "nyumba");
        expect(result.correctness).toBe("correct");
    });

    it("one letter off => almost", () => {
        const result = evaluateWithHeuristic(longTask, "ninakunzwa");
        expect(result.correctness).toBe("almost");
    });

    it("far off => wrong", () => {
        const result = evaluateWithHeuristic(task, "banana");
        expect(result.correctness).toBe("wrong");
        expect(result.correctAnswer).toBe("nyumba");
    });
});
