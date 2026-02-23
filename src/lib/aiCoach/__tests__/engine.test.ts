import { describe, expect, it } from "vitest";
import { createInitialAiCoachState, setResult, setTask, finish, skipTask } from "../engine";
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
    it("starts in idle state", () => {
        const state = createInitialAiCoachState();
        expect(state.status).toBe("idle");
        expect(state.totalCount).toBe(0);
    });

    it("stores task and sessionId", () => {
        const state = setTask(createInitialAiCoachState(), { sessionId: "s1", task: makeTask("c1") });
        expect(state.status).toBe("in_task");
        expect(state.sessionId).toBe("s1");
    });

    it("increments counters on correct result", () => {
        const withTask = setTask(createInitialAiCoachState(), { sessionId: "s1", task: makeTask("c1") });
        const state = setResult(withTask, {
            correctness: "correct",
            correctAnswer: "nyumba",
            score: 1,
            feedback: "ok",
            suggestedNext: "translate",
        });

        expect(state.totalCount).toBe(1);
        expect(state.correctCount).toBe(1);
        expect(state.streak).toBe(1);
    });

    it("tracks wrong card ids on wrong result", () => {
        const withTask = setTask(createInitialAiCoachState(), { sessionId: "s1", task: makeTask("c1") });
        const state = setResult(withTask, {
            correctness: "wrong",
            correctAnswer: "nyumba",
            score: 0.2,
            feedback: "no",
            suggestedNext: "repeat",
        });

        expect(state.wrongCardIds).toEqual(["c1"]);
        expect(state.streak).toBe(0);
    });

    it("can finish session", () => {
        const state = finish(createInitialAiCoachState());
        expect(state.status).toBe("finished");
    });

    it("skip increments totalCount and wrongCardIds", () => {
        const withTask = setTask(createInitialAiCoachState(), { sessionId: "s1", task: makeTask("c3") });
        const state = skipTask(withTask);

        expect(state.totalCount).toBe(1);
        expect(state.wrongCardIds).toContain("c3");
        expect(state.lastResult?.correctness).toBe("wrong");
    });

    it("almost does not increment correctCount", () => {
        const withTask = setTask(createInitialAiCoachState(), { sessionId: "s1", task: makeTask("c4") });
        const state = setResult(withTask, {
            correctness: "almost",
            correctAnswer: "nyumba",
            score: 0.9,
            feedback: "close",
            suggestedNext: "repeat",
        });

        expect(state.correctCount).toBe(0);
    });
});
