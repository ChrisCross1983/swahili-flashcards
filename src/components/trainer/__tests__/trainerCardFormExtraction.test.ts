import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("trainer card form extraction", () => {
    const root = process.cwd();
    const clientSource = fs.readFileSync(path.join(root, "src/app/trainer/TrainerClient.tsx"), "utf8");
    const formSource = fs.readFileSync(path.join(root, "src/components/trainer/TrainerCardFormSheet.tsx"), "utf8");

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
        expect(formSource).toContain("setCreateDraft({ german, swahili, germanExample, swahiliExample, note: formNoteDraft.mainNotes })");
        expect(formSource).toContain("openEditFromLearn(input)");
        expect(formSource).toContain("onReturnToLearn()");
        expect(formSource).toContain("onDeleted(deletedId)");
        expect(formSource).toContain("onAudioUpdated(resolvedCardId, newPath)");
    });

    it("surfaces strict duplicates, near matches, check loading, and check failure", () => {
        expect(formSource).toContain("Prüfe auf ähnliche Karten …");
        expect(formSource).toContain("Mögliche Dublette gefunden");
        expect(formSource).toContain("Ähnliche Karten gefunden");
        expect(formSource).toContain("Nicht zwingend eine Dublette");
        expect(formSource).toContain("Ähnlichkeitsprüfung konnte nicht abgeschlossen werden.");
        expect(formSource).toContain("onClick={() => editingId ? updateCard(true) : createCard(true)}");
        expect(formSource).toContain("setStatus(\"Karte aktualisiert ✅\")");
        expect(formSource).toContain("setStatus(\"Karte gespeichert ✅\")");
    });
});
