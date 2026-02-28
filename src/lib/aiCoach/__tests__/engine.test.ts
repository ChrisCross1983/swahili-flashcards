import { describe, expect, it } from "vitest";
import { createInitialAiCoachState, setTask, showHint, setResult } from "../engine";
import type { AiCoachTask } from "../types";

function makeTask(id: string): AiCoachTask {
    return {
        taskId: `task-${id}`,
        cardId: id,
        type: "translate",
        direction: "DE_TO_SW",
        prompt: "Übersetze: Haus",
        expectedAnswer: "nyumba",
        hint: "Denk an Alltag.",
        learnTip: "Merktipp: laut sagen.",
        ui: { inputMode: "text" },
    };
}

describe("ai coach engine", () => {
    it("clears feedback when next task is set", () => {
        const withTask = setTask(createInitialAiCoachState(), { sessionId: "s1", task: makeTask("c1") });
        const withResult = setResult(withTask, {
            correct: false,
            intent: "almost",
            score: 0.8,
            feedbackTitle: "Fast richtig",
            correctAnswer: "nyumba",
            learnTip: "Merktipp",
            retryAllowed: true,
        });

        const next = setTask(withResult, { task: makeTask("c2") });
        expect(next.lastResult).toBeNull();
        expect(next.currentTask?.taskId).toBe("task-c2");
    });

    it("tip button levels up from hint to learnTip", () => {
        const withTask = setTask(createInitialAiCoachState(), { sessionId: "s1", task: makeTask("c2") });
        const first = showHint(withTask);
        const second = showHint(first);

        expect(first.hintLevel).toBe(1);
        expect(second.hintLevel).toBe(2);
    });
});
