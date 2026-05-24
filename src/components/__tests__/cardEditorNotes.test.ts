import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("shared card editor notes integration", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/CardEditorSheet.tsx"), "utf8");

    it("loads existing card notes and auto-opens the section when notes exist", () => {
        expect(source).toContain("const loadFormNotes = useCallback");
        expect(source).toContain("/api/cards/notes?cardId=");
        expect(source).toContain("await loadFormNotes(String(card.id))");
        expect(source).toContain("setFormNoteOpen(Boolean(mainNotes.trim()))");
    });

    it("renders and saves own notes through the existing notes API", () => {
        expect(source).toContain("Eigene Notizen (optional)");
        expect(source).toContain("async function saveFormNotes");
        expect(source).toContain('method: "PATCH"');
        expect(source).toContain('fetch("/api/cards/notes"');
        expect(source).toContain("const notesSaved = await saveFormNotes(cardId)");
    });

    it("keeps the editor open and visible when card save succeeds but notes fail", () => {
        expect(source).toContain("Karte aktualisiert, aber Notizen konnten nicht gespeichert werden");
        expect(source).toContain("Bitte erneut speichern, damit die Notiz nicht verloren geht.");
        expect(source).toContain("if (!notesSaved)");
        expect(source).toContain("return;");
    });
});
