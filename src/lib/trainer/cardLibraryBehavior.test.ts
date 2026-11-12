import { describe, expect, it } from "vitest";
import { filterAndSortLibraryCards } from "./cardLibraryBehavior";

const cards = [
    { id: "new", german_text: "Haus", swahili_text: "nyumba", groups: [{ id: "alltag" }] },
    { id: "middle", german_text: "Baum", swahili_text: "mti", groups: [{ id: "natur" }] },
    { id: "old", german_text: "Haustür", swahili_text: "mlango wa nyumba", groups: [{ id: "alltag" }] },
];

describe("library search and sorting", () => {
    it("searches both languages by partial term, case and trimmed whitespace", () => {
        expect(filterAndSortLibraryCards(cards, "  HAUS ", [], "recent").map((card) => card.id)).toEqual(["new", "old"]);
        expect(filterAndSortLibraryCards(cards, "  NyuMBA  ", [], "recent").map((card) => card.id)).toEqual(["new", "old"]);
        expect(filterAndSortLibraryCards(cards, " mTi ", [], "recent").map((card) => card.id)).toEqual(["middle"]);
        expect(filterAndSortLibraryCards(cards, "nichts", [], "recent")).toEqual([]);
        expect(filterAndSortLibraryCards(cards, "", [], "recent")).toHaveLength(3);
    });
    it("combines search, group and sort without changing the default recent order", () => {
        expect(filterAndSortLibraryCards(cards, "haus", ["alltag"], "recent").map((card) => card.id)).toEqual(["new", "old"]);
        expect(filterAndSortLibraryCards(cards, "haus", ["alltag"], "az").map((card) => card.id)).toEqual(["new", "old"]);
        expect(filterAndSortLibraryCards(cards, "haus", ["alltag"], "za").map((card) => card.id)).toEqual(["old", "new"]);
        expect(filterAndSortLibraryCards(cards, "", [], "az").map((card) => card.id)).toEqual(["middle", "new", "old"]);
        expect(filterAndSortLibraryCards(cards, "", [], "za").map((card) => card.id)).toEqual(["old", "new", "middle"]);
    });
});
