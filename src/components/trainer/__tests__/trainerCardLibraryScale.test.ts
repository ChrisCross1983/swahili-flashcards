import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("trainer card library scale guards", () => {
    const clientSource = fs.readFileSync(path.join(process.cwd(), "src/app/trainer/TrainerClient.tsx"), "utf8");
    const hookSource = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerCardLibrary.ts"), "utf8");
    const sheetSource = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/TrainerCardLibrarySheet.tsx"), "utf8");

    it("renders a visible card window instead of mapping the full filtered list", () => {
        expect(hookSource).toContain("CARD_LIBRARY_PAGE_SIZE");
        expect(hookSource).toContain("const [visibleCount, setVisibleCount] = useState(CARD_LIBRARY_PAGE_SIZE)");
        expect(hookSource).toContain("const visibleCards = useMemo(");
        expect(hookSource).toContain("getVisibleCards(filteredCards, visibleCount)");
        expect(sheetSource).toContain("{visibleCards.map((card) => (");
        expect(sheetSource).not.toContain("{filteredCards.map((card) => (");
    });

    it("supports load-more and visible-count copy", () => {
        expect(hookSource).toContain("countLabel");
        expect(hookSource).toContain("shouldShowLoadMore(filteredCards.length, visibleCount)");
        expect(sheetSource).toContain("Mehr laden");
        expect(hookSource).toContain("nextVisibleCount(current, CARD_LIBRARY_PAGE_SIZE, filteredCards.length)");
    });

    it("resets the visible window on fresh open and group filtering", () => {
        expect(clientSource).toContain("cardLibrary.resetVisibleWindow()");
        expect(sheetSource).toContain("onGroupFilterChange(event.target.value ? [event.target.value] : [])");
        expect(hookSource).toContain("setSelectedIds(clearSelection())");
    });

    it("keeps visible-card actions wired for selection, edit, delete, groups, and duplicates", () => {
        expect(hookSource).toContain("selectAllVisible(visibleCards.map((card) => String(card.id)))");
        expect(clientSource).toContain("cardFormRef.current?.openEdit(card, \"cards\")");
        expect(clientSource).toContain("onDeleteCard={(cardId) => void deleteCard(cardId)}");
        expect(clientSource).toContain("onOpenCardGroupsEditor={openCardGroupsEditorForCard}");
        expect(clientSource).toContain("onOpenDuplicateReview={cardLibrary.openDuplicateReview}");
    });

    it("keeps TrainerClient as the library orchestrator instead of renderer", () => {
        expect(clientSource).toContain("<TrainerCardLibrarySheet");
        expect(clientSource).not.toContain("{visibleCards.map((c) => (");
        expect(clientSource).not.toContain("selectAllVisible(visibleCards.map");
    });
});
