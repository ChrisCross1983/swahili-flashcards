import { describe, expect, it } from "vitest";
import { buildChoices, rankDistractorsByPedagogicalFit } from "../policy";

describe("buildChoices fairness", () => {
    it("keeps options unique and includes correct answer once", () => {
        const choices = buildChoices("kitabu", ["kitabu", "nyumba", "chakula", "rafiki", "nyumba"], { direction: "DE_TO_SW" });
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
            ], { direction: "DE_TO_SW" });
            positions.add(choices.indexOf("kitabu"));
        }

        expect(positions.size).toBeGreaterThan(1);
        expect(positions.has(0)).toBe(true);
        expect(positions.has(1) || positions.has(2) || positions.has(3)).toBe(true);
    });

    it("filters out mixed-language distractors for DE_TO_SW", () => {
        const choices = buildChoices("kitabu", ["Haus", "nyumba", "Freund", "chakula", "Straße"], { direction: "DE_TO_SW" });
        expect(choices.every((item) => !/(haus|freund|straße)/i.test(item))).toBe(true);
    });

    it("filters out mixed-language distractors for SW_TO_DE", () => {
        const choices = buildChoices("Buch", ["kitabu", "Haus", "rafiki", "Fenster", "chakula"], { direction: "SW_TO_DE" });
        expect(choices.every((item) => !/(kitabu|rafiki|chakula)/i.test(item))).toBe(true);
    });

    it("filters noisy and sentence-like distractors", () => {
        const choices = buildChoices("kitabu", ["", "{placeholder}", "hii ni sentensi ndefu sana mno", "nyumba", "kalamu"], { direction: "DE_TO_SW" });
        expect(choices).not.toContain("");
        expect(choices.some((item) => item.includes("sentensi ndefu"))).toBe(false);
        expect(choices.some((item) => item.includes("placeholder"))).toBe(false);
    });

    it("does not force mcq with random fallback garbage", () => {
        const choices = buildChoices("kitabu", ["Haus", "Fenster", "Auto"], { direction: "DE_TO_SW" });
        expect(choices.length).toBeLessThan(4);
    });

    it("prefers form-matched distractors over sentence-like options", () => {
        const ranked = rankDistractorsByPedagogicalFit("asante sana", [
            { text: "pole sana" },
            { text: "habari yako" },
            { text: "hii ni sentensi ndefu sana kwa majaribio" },
            { text: "karibu tena" },
        ], { direction: "DE_TO_SW" });

        expect(ranked.some((entry) => entry.text.includes("sentensi ndefu"))).toBe(false);
        expect(ranked[0]?.text).toMatch(/(pole sana|habari yako|karibu tena)/i);
    });

});
