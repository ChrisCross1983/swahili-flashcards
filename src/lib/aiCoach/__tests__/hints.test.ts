import { describe, expect, it } from "vitest";
import { buildLearnTipForCard } from "../hints";

const card = { id: "1", german_text: "Lehrer", swahili_text: "mwalimu" };

describe("hints", () => {
    it("detects m/wa class for mwalimu", () => {
        const tip = buildLearnTipForCard(card);
        expect(tip).toContain("m/wa");
        expect(tip).toContain("Plural walimu");
    });
});
