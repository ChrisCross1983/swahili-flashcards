import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("trainer create/edit notes integration", () => {
    const clientSource = fs.readFileSync(path.join(process.cwd(), "src/app/trainer/TrainerClient.tsx"), "utf8");
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/TrainerCardFormSheet.tsx"), "utf8");
    const notesHookSource = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerCardFormNotes.ts"), "utf8");
    const saveFlowSource = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerCardSaveFlow.ts"), "utf8");

    it("renders optional own notes in the create/edit card flow", () => {
        expect(source).toContain("Eigene Notizen (optional)");
        expect(source).toContain("formNoteDraft");
        expect(source).toContain("min-h-[220px]");
    });

    it("loads existing card notes when editing an existing card", () => {
        expect(notesHookSource).toContain("async function loadFormNotes");
        expect(notesHookSource).toContain("/api/cards/notes?cardId=");
        expect(source).toContain("void loadFormNotes(String(card.id))");
        expect(source).toContain("void loadFormNotes(cardId)");
        expect(notesHookSource).toContain("setFormNoteOpen(shouldOpenNotesSection(mainNotes))");
    });

    it("saves create/edit notes through the existing card notes API", () => {
        expect(notesHookSource).toContain("async function saveFormNotes");
        expect(notesHookSource).toContain('method: "PATCH"');
        expect(notesHookSource).toContain('fetch("/api/cards/notes"');
        expect(saveFlowSource).toContain("if (shouldSaveCreateNote(createdCardId, formNoteText))");
        expect(saveFlowSource).toContain("await saveFormNotes(createdCardId, formNoteText)");
        expect(saveFlowSource).toContain("await saveFormNotes(updatedCardId)");
        expect(source).toContain("formNoteText: formNoteDraft.mainNotes");
    });

    it("keeps the form open and visible when card save succeeds but notes save fails", () => {
        expect(saveFlowSource).toContain("Karte gespeichert, aber nicht alle Zusatzdaten konnten gesichert werden.");
        expect(saveFlowSource).toContain("Karte aktualisiert, aber nicht alle Zusatzdaten konnten gesichert werden.");
        expect(saveFlowSource).toContain('partialFailures.push("Notizen")');
        expect(source).toContain("setEditingId(createdCardId)");
        expect(source).toContain("handleCreatePartialSuccess");
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
