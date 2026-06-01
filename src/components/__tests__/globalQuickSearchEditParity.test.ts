import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSource(relativePath: string) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("GlobalQuickSearch edit parity", () => {
    const quickSearch = readSource("src/components/GlobalQuickSearch.tsx");
    const trainerForm = readSource("src/components/trainer/TrainerCardFormSheet.tsx");
    const notesHook = readSource("src/lib/trainer/useTrainerCardFormNotes.ts");
    const duplicateHook = readSource("src/lib/trainer/useTrainerCardDuplicateCheck.ts");
    const mediaHook = readSource("src/lib/trainer/useTrainerCardMedia.ts");

    it("uses the shared TrainerCardFormSheet instead of the legacy CardEditorSheet", () => {
        expect(quickSearch).toContain("import TrainerCardFormSheet");
        expect(quickSearch).toContain("type TrainerCardFormSheetHandle");
        expect(quickSearch).toContain("<TrainerCardFormSheet");
        expect(quickSearch).toContain("cardFormRef.current?.openEdit(loadedCard, \"cards\")");
        expect(quickSearch).not.toContain("CardEditorSheet");
    });

    it("loads full card data and vocab groups before opening the shared edit form", () => {
        expect(quickSearch).toContain("fetchGroups(\"vocab\")");
        expect(quickSearch).toContain("/api/cards?id=");
        expect(quickSearch).toContain("&type=vocab");
        expect(quickSearch).toContain("groups={groups}");
        expect(quickSearch).toContain("cards={knownCards}");
        expect(quickSearch).toContain("onGroupsChange={setGroups}");
    });

    it("inherits notes, duplicate/similar warnings, groups, media, and status behavior", () => {
        expect(trainerForm).toContain("useTrainerCardFormNotes()");
        expect(notesHook).toContain("/api/cards/notes?cardId=");
        expect(notesHook).toContain('fetch("/api/cards/notes"');
        expect(trainerForm).toContain("useTrainerCardDuplicateCheck({ cardType, onStatus: setStatus })");
        expect(duplicateHook).toContain('fetch("/api/cards/check-existing"');
        expect(duplicateHook).toContain("excludeId");
        expect(duplicateHook).toContain("Ähnliche Karten gefunden");
        expect(trainerForm).toContain("<CompactGroupPicker");
        expect(trainerForm).toContain("Karte aktualisiert ✅");
        expect(mediaHook).toContain("openImageSuggestions");
        expect(mediaHook).toContain("startRecordingForEdit");
    });

    it("keeps quick-search results and cached cards in sync after edits, audio changes, and deletes", () => {
        expect(quickSearch).toContain("const handleSaved = useCallback((updated: CardResult, nextGroups?: Group[])");
        expect(quickSearch).toContain("mergeKnownCard(updatedWithGroups)");
        expect(quickSearch).toContain("setResults((prev) =>");
        expect(quickSearch).toContain("setSelected((prev) =>");
        expect(quickSearch).toContain("setKnownCards((prev) => prev.filter");
        expect(quickSearch).toContain("onAudioUpdated={(cardId, audioPath) =>");
    });
});
