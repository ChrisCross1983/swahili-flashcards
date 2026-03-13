import { describe, expect, it } from "vitest";
import { chooseRemediationTaskType, shouldAvoidImmediateReverse } from "../remediationPolicy";

describe("remediationPolicy", () => {
    it("avoids immediate reverse-direction repeat without remediation reason", () => {
        const avoid = shouldAvoidImmediateReverse({
            recentCardIds: ["c2", "c1"],
            recentDirections: ["DE_TO_SW"],
            currentCardId: "c1",
            currentDirection: "SW_TO_DE",
            lastResult: { correct: true } as any,
        });
        expect(avoid).toBe(true);
    });

    it("allows immediate reverse when morphology remediation is needed", () => {
        const avoid = shouldAvoidImmediateReverse({
            recentCardIds: ["c1"],
            recentDirections: ["DE_TO_SW"],
            currentCardId: "c1",
            currentDirection: "SW_TO_DE",
            lastResult: { correct: false, errorCategory: "wrong_form" } as any,
        });
        expect(avoid).toBe(false);
    });

    it("maps wrong answer to meaningful remediation task type", () => {
        expect(chooseRemediationTaskType({ correct: false, errorCategory: "semantic_confusion" } as any)).toBe("mcq");
        expect(chooseRemediationTaskType({ correct: false, errorCategory: "wrong_noun_class" } as any)).toBe("cloze");
        expect(chooseRemediationTaskType({ correct: true } as any)).toBeNull();
    });
});
