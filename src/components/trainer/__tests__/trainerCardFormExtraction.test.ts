import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("trainer card form extraction", () => {
    const root = process.cwd();
    const clientSource = fs.readFileSync(path.join(root, "src/app/trainer/TrainerClient.tsx"), "utf8");
    const formSource = fs.readFileSync(path.join(root, "src/components/trainer/TrainerCardFormSheet.tsx"), "utf8");
    const duplicateHookSource = fs.readFileSync(path.join(root, "src/lib/trainer/useTrainerCardDuplicateCheck.ts"), "utf8");
    const mediaHookSource = fs.readFileSync(path.join(root, "src/lib/trainer/useTrainerCardMedia.ts"), "utf8");
    const notesHookSource = fs.readFileSync(path.join(root, "src/lib/trainer/useTrainerCardFormNotes.ts"), "utf8");

    it("moves detailed create/edit form state out of TrainerClient", () => {
        expect(clientSource).toContain("<TrainerCardFormSheet");
        expect(clientSource).toContain("const cardFormRef = useRef<TrainerCardFormSheetHandle | null>(null)");

        for (const stateName of [
            "german",
            "swahili",
            "germanExample",
            "swahiliExample",
            "imageFile",
            "previewUrl",
            "duplicateHint",
            "duplicatePreview",
            "editingId",
            "editSource",
            "openCreate",
            "returnToLearn",
            "suggestOpen",
            "suggestLoading",
            "selectedSuggestUrl",
            "selectedSuggestPath",
            "suggestItems",
            "suggestError",
            "suggestedImagePath",
            "editAudioPath",
            "pendingAudioBlob",
            "pendingAudioType",
            "createDraft",
            "formGroupIds",
            "optionalExamplesOpen",
            "formNoteDraft",
        ]) {
            expect(clientSource).not.toContain(`const [${stateName},`);
        }
    });

    it("keeps create ordering: POST card, assign groups, upload audio, then save notes", () => {
        expect(formSource).toContain('method: "POST"');
        expect(formSource).toContain("await assignCardsToGroup(cardType, groupId, [createdCardId])");
        expect(formSource).toContain('fetch("/api/upload-audio", { method: "POST"');
        expect(formSource).toContain("await saveFormNotes(createdCardId, formNoteDraft.mainNotes)");
        expect(formSource.indexOf('method: "POST"')).toBeLessThan(formSource.indexOf("await assignCardsToGroup(cardType, groupId, [createdCardId])"));
        expect(formSource.indexOf("await assignCardsToGroup(cardType, groupId, [createdCardId])")).toBeLessThan(formSource.indexOf("await saveFormNotes(createdCardId, formNoteDraft.mainNotes)"));
    });

    it("keeps edit ordering: PATCH card, update groups/session callback, then save notes", () => {
        expect(formSource).toContain('method: "PATCH"');
        expect(formSource).toContain("const groupChanges = diffGroupAssignments(editingOriginalGroupIds, formGroupIds)");
        expect(formSource).toContain("await removeCardFromGroup(groupId, updatedCardId)");
        expect(formSource).toContain("await onUpdated(updated, nextGroups)");
        expect(formSource).toContain("const notesSaved = await saveFormNotes(updatedCardId)");
        expect(formSource.indexOf("await onUpdated(updated, nextGroups)")).toBeLessThan(formSource.indexOf("const notesSaved = await saveFormNotes(updatedCardId)"));
    });

    it("preserves duplicate review, edit-from-learn, cancel, delete, and audio callbacks", () => {
        expect(formSource).toContain("const shouldReview = await checkExistingGerman(trimmedGerman, trimmedSwahili");
        expect(formSource).toContain("Trotzdem speichern");
        expect(formSource).toContain("setCreateDraft(createDraftFromTextState({ german, swahili, germanExample, swahiliExample }, formNoteDraft.mainNotes))");
        expect(formSource).toContain("openEditFromLearn(input)");
        expect(formSource).toContain("onReturnToLearn()");
        expect(formSource).toContain("onDeleted(deletedId)");
        expect(mediaHookSource).toContain("onAudioUpdated(resolvedCardId, newPath)");
    });

    it("surfaces strict duplicates, near matches, check loading, and check failure", () => {
        expect(duplicateHookSource).toContain("Prüfe auf ähnliche Karten …");
        expect(duplicateHookSource).toContain("Mögliche Dublette gefunden");
        expect(duplicateHookSource).toContain("Ähnliche Karten gefunden");
        expect(formSource).toContain("Nicht zwingend eine Dublette");
        expect(duplicateHookSource).toContain("Ähnlichkeitsprüfung konnte nicht abgeschlossen werden.");
        expect(formSource).toContain("onClick={() => editingId ? updateCard(true) : createCard(true)}");
        expect(formSource).toContain("setStatus(\"Karte aktualisiert ✅\")");
        expect(formSource).toContain("setStatus(\"Karte gespeichert ✅\")");
    });

    it("extracts notes, duplicate, and media domains out of the sheet", () => {
        expect(formSource).toContain("useTrainerCardFormNotes()");
        expect(formSource).toContain("useTrainerCardDuplicateCheck({ cardType, onStatus: setStatus })");
        expect(formSource).toContain("useTrainerCardMedia({ onStatus: setStatus, onAudioUpdated })");
        expect(notesHookSource).toContain("restoreDraftNote");
        expect(duplicateHookSource).toContain("clearDuplicateCheck");
        expect(mediaHookSource).toContain("resetMediaInputs");
    });

    it("renders form feedback near the primary card fields instead of bottom-only", () => {
        const swahiliFieldIndex = formSource.indexOf("placeholder=\"z.B. Habari za asubuhi\"");
        const topStatusIndex = formSource.indexOf("topStatusText ? (");
        const optionalContextIndex = formSource.indexOf("Optional: Beispielsätze hinzufügen");
        const mediaIndex = formSource.indexOf("<div className=\"mt-6 text-sm font-medium\">Medien</div>");

        expect(topStatusIndex).toBeGreaterThan(swahiliFieldIndex);
        expect(topStatusIndex).toBeLessThan(optionalContextIndex);
        expect(formSource.indexOf("{duplicateFeedbackPanel}")).toBeLessThan(optionalContextIndex);
        expect(formSource.indexOf("{duplicateFeedbackPanel}")).toBeLessThan(mediaIndex);
        expect(formSource).toContain("aria-live=\"polite\"");
        expect(formSource).toContain("Du kannst direkt die nächste Karte anlegen.");
    });
});
