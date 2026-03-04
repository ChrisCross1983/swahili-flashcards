import { describe, expect, it, vi } from "vitest";
import { decideNextTaskType } from "../policy";

describe("policy", () => {
    it("chooses easier task types for mastery level 0", () => {
        vi.spyOn(Math, "random").mockReturnValue(0.05);
        const next = decideNextTaskType([], 0, undefined, true, 0);
        expect(["mcq", "translate"]).toContain(next);
        vi.restoreAllMocks();
    });

    it("avoids repeating the same type when possible", () => {
        const next = decideNextTaskType(["translate"], 1, "translate", true, 3);
        expect(next).not.toBe("translate");
    });
});
