import { describe, expect, it } from "vitest";
import {
    CARD_LIBRARY_PAGE_SIZE,
    getLibraryCountLabel,
    getVisibleCards,
    nextVisibleCount,
    shouldShowLoadMore,
} from "@/lib/trainer/cardLibraryBehavior";

describe("card library visible window behavior", () => {
    const cards = Array.from({ length: 125 }, (_, index) => ({ id: String(index + 1) }));

    it("limits the initially visible cards", () => {
        expect(CARD_LIBRARY_PAGE_SIZE).toBe(50);
        expect(getVisibleCards(cards, CARD_LIBRARY_PAGE_SIZE)).toHaveLength(50);
        expect(getVisibleCards(cards, 0)).toEqual([]);
    });

    it("increments the visible count without exceeding the filtered total", () => {
        expect(nextVisibleCount(50, 50, 125)).toBe(100);
        expect(nextVisibleCount(100, 50, 125)).toBe(125);
        expect(shouldShowLoadMore(125, 50)).toBe(true);
        expect(shouldShowLoadMore(125, 125)).toBe(false);
    });

    it("labels visible and filtered totals clearly", () => {
        expect(getLibraryCountLabel({ visible: 50, total: 172, filtered: false })).toBe("50 von 172 Karten angezeigt");
        expect(getLibraryCountLabel({ visible: 50, total: 83, filtered: true })).toBe("50 von 83 passenden Karten angezeigt");
        expect(getLibraryCountLabel({ visible: 20, total: 20, filtered: false, itemLabel: "Sätze" })).toBe("20 von 20 Sätze angezeigt");
    });
});
