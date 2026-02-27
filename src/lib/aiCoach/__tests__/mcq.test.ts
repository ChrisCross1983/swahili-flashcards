import { describe, expect, it } from "vitest";
import { buildMcqChoices } from "../tasks/mcq";

describe("buildMcqChoices", () => {
    it("returns 4 unique options and includes correct answer once", () => {
        const options = buildMcqChoices("sungura", [
            { id: "1", answer: "simba" },
            { id: "2", answer: "samaki" },
            { id: "3", answer: "sukari" },
            { id: "4", answer: "sungura" },
            { id: "5", answer: "simba" },
        ]);

        expect(options).toHaveLength(4);
        expect(new Set(options).size).toBe(4);
        expect(options.filter((item) => item === "sungura")).toHaveLength(1);
    });
});
