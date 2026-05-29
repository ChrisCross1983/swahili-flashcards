import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { filterCardsByGroups } from "@/lib/trainer/useTrainerCardLibrary";

describe("useTrainerCardLibrary domain behavior", () => {
    it("filters cards by selected group ids", () => {
        const cards = [
            { id: "1", groups: [{ id: "g1" }] },
            { id: "2", groups: [{ id: "g2" }] },
            { id: "3", groups: [] },
        ];

        expect(filterCardsByGroups(cards, [])).toEqual(cards);
        expect(filterCardsByGroups(cards, ["g2"])).toEqual([{ id: "2", groups: [{ id: "g2" }] }]);
        expect(filterCardsByGroups(cards, ["missing"])).toEqual([]);
    });

    it("owns visible-window, selection, and duplicate-review state outside TrainerClient", () => {
        const source = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerCardLibrary.ts"), "utf8");

        expect(source).toContain("CARD_LIBRARY_PAGE_SIZE");
        expect(source).toContain("getVisibleCards(filteredCards, visibleCount)");
        expect(source).toContain("nextVisibleCount(current, CARD_LIBRARY_PAGE_SIZE, filteredCards.length)");
        expect(source).toContain("selectAllVisible(visibleCards.map((card) => String(card.id)))");
        expect(source).toContain("removeDeletedFromSelection(prev, deletedSet)");
        expect(source).toContain("setDuplicateReviewOpen");
    });

    it("resets visible window and selection when the group filter changes", () => {
        const source = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerCardLibrary.ts"), "utf8");

        expect(source).toContain("setGroupFilterState(nextGroupIds)");
        expect(source).toContain("setVisibleCount(CARD_LIBRARY_PAGE_SIZE)");
        expect(source).toContain("setSelectedIds(clearSelection())");
    });
});
