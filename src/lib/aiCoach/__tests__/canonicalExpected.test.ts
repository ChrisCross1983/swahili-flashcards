import { describe, expect, it } from "vitest";
import { canonicalExpectedAnswer, resolveCanonicalTask } from "../taskIntegrity";
import type { AiCoachTask } from "../types";

const card = { id: "c1", german_text: "Haus", swahili_text: "nyumba", type: "vocab" as const };

function makeTask(direction: AiCoachTask["direction"]): AiCoachTask {
    return {
        taskId: "t1",
        cardId: "c1",
        type: "translate",
        direction,
        prompt: "fake prompt",
        expectedAnswer: "client tampered",
    };
}

describe("canonical task integrity", () => {
    it("derives expected answer from canonical card + direction", () => {
        expect(canonicalExpectedAnswer(card, "DE_TO_SW")).toBe("nyumba");
        expect(canonicalExpectedAnswer(card, "SW_TO_DE")).toBe("Haus");
    });

    it("overrides client expected answer in resolved task", () => {
        const task = resolveCanonicalTask(makeTask("DE_TO_SW"), card);
        expect(task.expectedAnswer).toBe("nyumba");
        expect(task.prompt).toBe("fake prompt");
    });
});
