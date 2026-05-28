import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("trainer card library scale guards", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/trainer/TrainerClient.tsx"), "utf8");

    it("renders a visible card window instead of mapping the full filtered list", () => {
        expect(source).toContain("CARD_LIBRARY_PAGE_SIZE");
        expect(source).toContain("const [cardLibraryVisibleCount, setCardLibraryVisibleCount] = useState(CARD_LIBRARY_PAGE_SIZE)");
        expect(source).toContain("const visibleCards = useMemo(");
        expect(source).toContain("getVisibleCards(filteredCards, cardLibraryVisibleCount)");
        expect(source).toContain("{visibleCards.map((c) => (");
        expect(source).not.toContain("{filteredCards.map((c) => (");
    });

    it("supports load-more and visible-count copy", () => {
        expect(source).toContain("libraryCountLabel");
        expect(source).toContain("shouldShowLoadMore(filteredCards.length, cardLibraryVisibleCount)");
        expect(source).toContain("Mehr laden");
        expect(source).toContain("nextVisibleCount(current, CARD_LIBRARY_PAGE_SIZE, filteredCards.length)");
    });

    it("resets the visible window on fresh open and group filtering", () => {
        expect(source).toContain("setCardLibraryVisibleCount(CARD_LIBRARY_PAGE_SIZE)");
        expect(source).toContain("setSelectedGroupIds(event.target.value ? [event.target.value] : [])");
        expect(source).toContain("setSelectedCardIds(clearSelection())");
    });

    it("keeps visible-card actions wired for selection, edit, delete, groups, and duplicates", () => {
        expect(source).toContain("selectAllVisible(visibleCards.map((card) => String(card.id)))");
        expect(source).toContain("cardFormRef.current?.openEdit(c, \"cards\")");
        expect(source).toContain("deleteCard(c.id)");
        expect(source).toContain("openCardGroupsEditorForCard(c)");
        expect(source).toContain("setDuplicateReviewOpen(true)");
    });
});
