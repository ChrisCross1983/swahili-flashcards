import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("trainer create/edit notes integration", () => {
    const clientSource = fs.readFileSync(path.join(process.cwd(), "src/app/trainer/TrainerClient.tsx"), "utf8");
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/TrainerCardFormSheet.tsx"), "utf8");

    it("renders optional own notes in the create/edit card flow", () => {
        expect(source).toContain("Eigene Notizen (optional)");
        expect(source).toContain("formNoteDraft");
        expect(source).toContain("min-h-[220px]");
    });

    it("loads existing card notes when editing an existing card", () => {
        expect(source).toContain("async function loadFormNotes");
        expect(source).toContain("/api/cards/notes?cardId=");
        expect(source).toContain("void loadFormNotes(String(card.id))");
        expect(source).toContain("void loadFormNotes(cardId)");
        expect(source).toContain("setFormNoteOpen(shouldOpenNotesSection(mainNotes))");
    });

    it("saves create/edit notes through the existing card notes API", () => {
        expect(source).toContain("async function saveFormNotes");
        expect(source).toContain('method: "PATCH"');
        expect(source).toContain('fetch("/api/cards/notes"');
        expect(source).toContain("if (shouldSaveCreateNote(createdCardId, formNoteDraft.mainNotes))");
        expect(source).toContain("await saveFormNotes(createdCardId, formNoteDraft.mainNotes)");
        expect(source).toContain("await saveFormNotes(updatedCardId)");
    });

    it("keeps the form open and visible when card save succeeds but notes save fails", () => {
        expect(source).toContain("Karte gespeichert, aber Notizen konnten nicht gespeichert werden");
        expect(source).toContain("Karte aktualisiert, aber Notizen konnten nicht gespeichert werden");
        expect(source).toContain("setEditingId(createdCardId)");
        expect(source).toContain("return;");
    });

    it("keeps training-mode notes on the separate learning notes flow", () => {
        expect(clientSource).toContain("async function openLearningHelp");
        expect(clientSource).toContain("setCardNoteCardId(cardId)");
        expect(clientSource).toContain("setCardNoteDraft({");
        expect(clientSource).toContain("handleNotesOverlayClose");
    });

    it("wires edit entry points through the extracted card form sheet", () => {
        expect(clientSource).toContain("<TrainerCardFormSheet");
        expect(clientSource).toContain("<TrainerCardLibrarySheet");
        expect(clientSource).toContain("cardFormRef.current?.openCreate()");
        expect(clientSource).toContain("cardFormRef.current?.openEdit(card, \"cards\")");
        expect(clientSource).toContain("cardFormRef.current?.openEditFromLearn({");
    });
});
