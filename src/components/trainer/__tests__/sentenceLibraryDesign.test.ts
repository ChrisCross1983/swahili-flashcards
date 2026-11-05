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

    it("keeps card actions inside the card and management actions behind More", () => {
        expect(component).toContain("sentence-library-card-actions");
        expect(css).toContain(".sentence-library-card-actions { position: static");
        expect(component).toContain("onEditCard(card)");
        expect(component).toContain("onDeleteCard(id)");
        expect(component).toContain("onOpenDuplicateReview()");
        expect(component).toContain("onOpenManageGroups()");
        expect(component).toContain("onGroupFilterChange([])");
        expect(component).toContain("onToggleSelected(card.id)");
        expect(component).toContain("onCreateSentence");
    });
});
