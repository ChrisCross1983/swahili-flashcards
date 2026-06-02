import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSource(relativePath: string) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("TrainerCardFormSheet save-flow integration", () => {
    const formSource = readSource("src/components/trainer/TrainerCardFormSheet.tsx");
    const saveFlowSource = readSource("src/lib/trainer/useTrainerCardSaveFlow.ts");
    const duplicateHookSource = readSource("src/lib/trainer/useTrainerCardDuplicateCheck.ts");

    it("centralizes create flow after duplicate checking", () => {
        expect(saveFlowSource).toContain("if (await runDuplicateCheck(skipWarning, null)) return");
        expect(saveFlowSource).toContain('method: "POST"');
        expect(saveFlowSource).toContain("await assignCardsToGroup(cardType, groupId, [createdCardId])");
        expect(saveFlowSource).toContain("const audioSaved = await uploadCreateAudio(createdCardId, media)");
        expect(saveFlowSource).toContain("await saveFormNotes(createdCardId, formNoteText)");
        expect(saveFlowSource).toContain("await onCreated(created)");
        expect(saveFlowSource).toContain("onCreateSuccess(created)");
        expect(formSource).toContain("function handleCreateSuccess()");
    });

    it("blocks similar warnings until override and keeps override behavior explicit", () => {
        expect(duplicateHookSource).toContain("checkExistingGermanDetailed");
        expect(saveFlowSource).toContain('if (result === "similar" || result === "failure") return "blocked_by_similar"');
        expect(saveFlowSource).toContain("function saveDespiteWarning()");
        expect(formSource).toContain("onClick={saveFlow.saveDespiteWarning}");
        expect(formSource).toContain("Trotzdem speichern");
    });

    it("centralizes update flow with current-card duplicate exclusion", () => {
        expect(saveFlowSource).toContain("if (await runDuplicateCheck(skipWarning, editingId)) return");
        expect(saveFlowSource).toContain('method: "PATCH"');
        expect(saveFlowSource).toContain("const groupChanges = diffGroupAssignments(editingOriginalGroupIds, formGroupIds)");
        expect(saveFlowSource).toContain("await onUpdated(updated, nextGroups)");
        expect(saveFlowSource).toContain("onUpdateSuccess(updated, nextGroups)");
        expect(formSource).toContain("function handleUpdateSuccess(_updated: any, nextGroups: Group[])");
    });

    it("surfaces partial success when secondary persistence fails after card save", () => {
        expect(saveFlowSource).toContain('partialFailures.push("Gruppen")');
        expect(saveFlowSource).toContain('partialFailures.push("Audio")');
        expect(saveFlowSource).toContain('partialFailures.push("Notizen")');
        expect(saveFlowSource).toContain('setSaveStatus("partial_success")');
        expect(saveFlowSource).toContain("onCreatePartialSuccess(created, partialFailures)");
        expect(saveFlowSource).toContain("onUpdatePartialSuccess(updated, nextGroups, partialFailures)");
    });

    it("guards interactions during active save/check and clears stale feedback on input changes", () => {
        expect(saveFlowSource).toContain("createSaveFlowSubmitGuard");
        expect(formSource).toContain("disabled={!german.trim() || !swahili.trim() || saveFlow.isSaveBusy}");
        expect(formSource).toContain("if (saveFlow.isSaveBusy) return");
        expect(formSource).toContain("handlePrimaryFieldChange(setGerman");
        expect(formSource).toContain("clearDuplicateCheck()");
        expect(formSource).toContain("saveFlow.clearFeedbackForInputChange()");
    });
});
