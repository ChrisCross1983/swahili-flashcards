import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import WordLibraryCard, { positionWordLibraryMenu } from "../WordLibraryCard";
import type { TrainerLibraryCard } from "@/lib/trainer/useTrainerCardLibrary";
import { updateLibraryNoteStatus } from "@/lib/trainer/useTrainerCardLibrary";

const handlers = {
    onToggleSelected: vi.fn(), onToggleActions: vi.fn(), onPlayAudio: vi.fn(),
    onEditCard: vi.fn(), onViewCard: vi.fn(), onOpenCardGroupsEditor: vi.fn(), onDeleteCard: vi.fn(),
};
const base = { imageBaseUrl: "https://example.test/images", selected: false, selectionMode: false, actionOpen: false, ...handlers };
const render = (card: TrainerLibraryCard) => renderToStaticMarkup(<WordLibraryCard {...base} card={card} />);

describe("WordLibraryCard", () => {
    it("keeps one mobile and at most two desktop columns with a stable footer", () => {
        const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
        expect(css).toContain(".word-library-grid { grid-template-columns: minmax(0, 1fr); align-items: stretch; }");
        expect(css).toContain(".word-library-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
        expect(css).toContain(".library-feature-status { display: flex; min-height: 37px");
        expect(css).toContain(".word-library-pair { display: grid;");
    });
    it("separates language labels and words without a thumbnail", () => {
        const html = render({ id: "v1", german_text: "vielleicht", swahili_text: "labda" });
        expect(html).toMatch(/word-library-language">DE<\/span><span[^>]*word-library-german">vielleicht/);
        expect(html).toMatch(/word-library-language">SW<\/span><span[^>]*word-library-swahili">labda/);
        expect(html).not.toContain("word-library-thumb");
        expect(html.match(/library-feature-status-icon/g)).toHaveLength(5);
        expect(html).toContain('aria-label="Keine Illustration"');
        expect(html).toContain('aria-label="Keine Gruppe"');
        expect(html).toContain('aria-label="Keine Aussprache"');
        expect(html).toContain('aria-label="Keine Notiz"');
        expect(html).toContain('aria-label="Keine Worterklärung"');
    });
    it("shows a thumbnail and the existing active features", () => {
        const html = render({ id: "v2", german_text: "Katze", swahili_text: "paka", image_path: "cat.webp", audio_path: "cat.mp3", has_note: true, groups: [{ id: "g1", name: "Tiere" }] });
        expect(html.match(/<img/g)).toHaveLength(1);
        expect(html).toContain("word-library-thumb");
        for (const name of ["Illustration", "Gruppe", "Aussprache", "Notiz"]) expect(html).toContain(`aria-label="${name} vorhanden${name === "Aussprache" ? ", abspielen" : name === "Gruppe" || name === "Notiz" ? ", anzeigen" : ""}"`);
        expect(html).not.toContain("Tiere</span>");
    });
    it("activates the fifth shared status only for sufficient word enrichment", () => {
        const enrichment = { pos: "noun" as const, noun_class: "ki/vi", singular: "chumba", plural: "vyumba", mnemonic: null,
            notes: "Auch dieses und groß ändern sich im Plural.", examples: [{ sw: "Chumba hiki ni kikubwa.", de: "Dieses Zimmer ist groß." }] };
        const active = render({ id: "v5", swahili_text: "chumba", word_enrichment: enrichment });
        expect(active).toContain('aria-label="Worterklärung vorhanden, anzeigen"');
        const incomplete = render({ id: "v5", swahili_text: "chumba", word_enrichment: { ...enrichment, examples: [] } });
        expect(incomplete).toContain('aria-label="Keine Worterklärung"');
    });
    it("shows multiple groups without treating unmigrated legacy examples as notes", () => {
        const html = render({ id: "v3", groups: [{ id: "1", name: "Erste" }, { id: "2", name: "Zweite" }], german_example: "Alt" });
        expect(html).toContain('aria-label="Gruppe vorhanden, anzeigen"');
        expect(html).toContain('aria-label="Keine Notiz"');
    });
    it("updates only the saved card immediately when a note is added or cleared", () => {
        const cards: TrainerLibraryCard[] = [
            { id: "v3", german_example: "Alt", has_note: false },
            { id: "other", has_note: true },
            { id: "sentence", type: "sentence", has_note: true },
        ];
        const saved = updateLibraryNoteStatus(cards, "v3", "**Neue Notiz**");
        expect(render(saved[0])).toContain('aria-label="Notiz vorhanden, anzeigen"');
        expect(saved[0].note_preview?.main_notes).toBe("**Neue Notiz**");
        expect(saved[1]).toBe(cards[1]);
        expect(saved[2]).toBe(cards[2]);
        const cleared = updateLibraryNoteStatus(saved, "v3", "");
        expect(render(cleared[0])).toContain('aria-label="Keine Notiz"');
        expect(cleared[0].note_preview?.main_notes).toBe("");
        expect(cleared[1]).toBe(cards[1]);
        expect(cleared[2]).toBe(cards[2]);
    });
    it("uses one floating portal implementation with separate actions", () => {
        const source = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/WordLibraryCard.tsx"), "utf8");
        const menu = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/FloatingLibraryMenu.tsx"), "utf8");
        expect(source).toContain("<FloatingLibraryMenu");
        expect(source).toContain("Bearbeiten");
        expect(source).toContain("Gruppe</button>");
        expect(source).toContain("Löschen");
        expect(menu).toContain("createPortal(");
        expect(menu).toContain("document.body");
        expect(menu).toContain('window.addEventListener("scroll", update, true)');
        expect(menu).toContain('window.addEventListener("resize", update)');
    });
    it("opens below upper cards and above lower cards within mobile bounds", () => {
        expect(positionWordLibraryMenu({ top: 30, bottom: 74, right: 310 }, { width: 320, height: 600 })).toEqual({ top: 78, left: 132 });
        expect(positionWordLibraryMenu({ top: 520, bottom: 564, right: 310 }, { width: 320, height: 600 })).toEqual({ top: 374, left: 132 });
        expect(positionWordLibraryMenu({ top: 520, bottom: 564, right: 200 }, { width: 320, height: 600 })).toEqual({ top: 374, left: 22 });
    });
    it("keeps selection mode accessible", () => {
        const html = renderToStaticMarkup(<WordLibraryCard {...base} selectionMode selected card={{ id: "v4", german_text: "Baum", swahili_text: "mti" }} />);
        expect(html).toContain('aria-label="Wort auswählen: Baum"');
        expect(html).toContain('data-selected="true"');
        expect(html).not.toContain('aria-label="Aktionen für Baum"');
    });
});
