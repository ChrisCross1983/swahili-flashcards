import { describe, expect, it } from "vitest";
import { buildChoices } from "../policy";

describe("buildChoices fairness", () => {
    it("keeps options unique and includes correct answer once", () => {
        const choices = buildChoices("kitabu", ["kitabu", "nyumba", "chakula", "rafiki", "nyumba"]);
        expect(new Set(choices).size).toBe(choices.length);
        expect(choices.filter((item) => item === "kitabu")).toHaveLength(1);
    });

    it("does not keep the correct answer at a fixed index", () => {
        const positions = new Set<number>();

        for (let i = 0; i < 80; i += 1) {
            const choices = buildChoices("kitabu", [
                "nyumba",
                "rafiki",
                "chakula",
                "soko",
                "meza",
                "kikombe",
                "kalamu",
            ]);
            positions.add(choices.indexOf("kitabu"));
        }

        expect(positions.size).toBeGreaterThan(1);
        expect(positions.has(0)).toBe(true);
        expect(positions.has(1) || positions.has(2) || positions.has(3)).toBe(true);
    });
});
