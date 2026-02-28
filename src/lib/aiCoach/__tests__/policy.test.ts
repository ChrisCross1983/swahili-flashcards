import { describe, expect, it } from "vitest";
import { decideNextTaskType } from "../policy";

describe("policy", () => {
    it("never allows 3 translate tasks in a row", () => {
        const next = decideNextTaskType(["translate", "translate"], 1, "translate", true);
        expect(next).not.toBe("translate");
    });
});
