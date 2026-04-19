import { describe, expect, it } from "vitest";
import { cardMatchesDomain, findExistingMatch } from "@/lib/cards/existence";

describe("card domain matching", () => {
    it("treats null/legacy type as vocab", () => {
        expect(cardMatchesDomain(null, "vocab")).toBe(true);
        expect(cardMatchesDomain(undefined, "vocab")).toBe(true);
        expect(cardMatchesDomain("sentence", "vocab")).toBe(false);
    });

    it("scopes sentence matching to sentence cards", () => {
        expect(cardMatchesDomain("sentence", "sentence")).toBe(true);
        expect(cardMatchesDomain("vocab", "sentence")).toBe(false);
        expect(cardMatchesDomain(null, "sentence")).toBe(false);
    });
});

describe("findExistingMatch", () => {
    const cards = [
        { id: "v-1", swahili_text: "habari", german_text: "hallo", swahili_example: "==habari== rafiki", german_example: "==Hallo== Freund", type: "vocab" },
        { id: "s-1", swahili_text: "habari", german_text: "hallo", type: "sentence" },
        { id: "v-2", swahili_text: "asante", german_text: "danke", type: null },
    ];

    it("does not let vocab entries block sentence saves", () => {
        const result = findExistingMatch(cards, { sw: "habari", de: "hallo", type: "sentence" });
        expect(result).toEqual({ existingId: "s-1", match: "pair" });
    });

    it("does not let sentence entries block vocab saves", () => {
        const sentenceOnlyCards = [{ id: "s-1", swahili_text: "ndio", german_text: "ja", type: "sentence" }];
        const result = findExistingMatch(sentenceOnlyCards, { sw: "ndio", de: "ja", type: "vocab" });
        expect(result).toEqual({ existingId: null, match: null });
    });

    it("still reports same-domain partial conflicts", () => {
        const result = findExistingMatch(cards, { sw: "asante", de: "vielen dank", type: "vocab" });
        expect(result).toEqual({ existingId: "v-2", match: "sw" });
    });

    it("ignores example fields for existence semantics", () => {
        const result = findExistingMatch(cards, { sw: "habari", de: "hallo", type: "vocab" });
        expect(result).toEqual({ existingId: "v-1", match: "pair" });
    });
});
