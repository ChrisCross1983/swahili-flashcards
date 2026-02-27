import { describe, expect, it } from "vitest";
import { createInitialAiCoachState, retryCurrentTask, setResult, setTask } from "../engine";
import type { AiCoachTask } from "../types";

function makeTask(id: string): AiCoachTask {
    return {
        taskId: `task-${id}`,
        cardId: id,
        type: "translate",
        direction: "DE_TO_SW",
        prompt: "Übersetze: Haus",
        expectedAnswer: "nyumba",
    };
}

describe("ai coach engine", () => {
    it("almost counts as answered but not correct", () => {
        const withTask = setTask(createInitialAiCoachState(), { sessionId: "s1", task: makeTask("c1") });
        const state = setResult(withTask, {
            correct: false,
            intent: "almost",
            scoreNormalized: 0.8,
            feedback: { headline: "⚠️ Fast richtig", solution: "nyumba" },
            actionHints: { canRetry: true, shouldOfferMcq: false, nextLabel: "Weiter" },
        });

        expect(state.totalCount).toBe(1);
        expect(state.correctCount).toBe(0);
        expect(state.answeredCardIds).toContain("c1");
    });

    it("retry increments hint level and keeps same task/card", () => {
        const withTask = setTask(createInitialAiCoachState(), { sessionId: "s1", task: makeTask("c2") });
        const retried = retryCurrentTask(withTask);

        expect(retried.hintLevel).toBe(1);
        expect(retried.currentTask?.taskId).toBe("task-c2");
        expect(retried.currentTask?.cardId).toBe("c2");
    });
});
