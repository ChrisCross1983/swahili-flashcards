import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const component = fs.readFileSync(path.join(root, "src/components/trainer/SentenceLibrarySheet.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

describe("sentence library interaction layout", () => {
    it("uses the same palette, responsive grid, focus and reduced-motion rules as the sentence composer", () => {
        expect(css).toContain(".sentence-library-grid { display: grid; grid-template-columns: minmax(0, 1fr)");
        expect(css).toContain("@media (min-width: 768px) { .sentence-library-grid { grid-template-columns: repeat(2");
        expect(css).toContain(".sentence-library-card:not(.has-menu):hover { transform: translateY(-2px)");
        expect(css).toContain(".sentence-library-card.is-selected");
        expect(css).toContain(".sentence-library-card-main:focus-visible");
        expect(css).toContain("@media (prefers-reduced-motion: reduce) { .sentence-library-card");
    });

    it("uses shared floating card actions and keeps management actions behind More", () => {
        const card = fs.readFileSync(path.join(root, "src/components/trainer/SentenceLibraryCard.tsx"), "utf8");
        const menu = fs.readFileSync(path.join(root, "src/components/trainer/FloatingLibraryMenu.tsx"), "utf8");
        expect(component).toContain("<SentenceLibraryCard");
        expect(card).toContain("<FloatingLibraryMenu");
        expect(card).toContain("onEditCard(card)");
        expect(card).toContain("onDeleteCard(id)");
        expect(menu).toContain("createPortal(");
        expect(menu).toContain('window.addEventListener("scroll", update, true)');
        expect(component).toContain("onOpenDuplicateReview()");
        expect(component).toContain("onOpenManageGroups()");
        expect(component).toContain("onGroupFilterChange([])");
        expect(component).toContain("onCreateSentence");
    });
});
