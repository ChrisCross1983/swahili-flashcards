import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSource(relativePath: string) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("create a card from global quick search", () => {
    const search = readSource("src/components/GlobalQuickSearch.tsx");
    const cardForm = readSource("src/components/trainer/TrainerCardFormSheet.tsx");
    const globalOverlays = readSource("src/components/GlobalOverlays.tsx");
    const layout = readSource("src/app/layout.tsx");

    it("shows a compact create action for a non-empty query, including no-result searches", () => {
        expect(search).toContain("Keine Ergebnisse gefunden.");
        expect(search).toContain("{query.trim() ? (");
        expect(search).toContain("+ Neues Wort anlegen");
        expect(search).toContain("onClick={handleCreateFromSearch}");
    });

    it("opens the existing card form without pre-filling either word field", () => {
        expect(search).toContain("cardFormRef.current?.openCreate()");
        expect(search).not.toContain("openCreate({");
        expect(search).toContain("<TrainerCardFormSheet");
        expect(cardForm).toContain("openCreate: () => void");
        expect(cardForm).toContain("function resetForCreate()");
        expect(cardForm).toContain("setGerman(\"\");");
        expect(cardForm).toContain("setSwahili(\"\");");
    });

    it("clears the query and dependent results after successful save and cancel", () => {
        expect(search).toContain("const resetSearchAfterCreate = useCallback(() => {");
        expect(search).toContain("setQuery(\"\");");
        expect(search).toContain("setResults([]);");
        expect(search).toContain("onCreateFlowComplete={resetSearchAfterCreate}");
        expect(cardForm).toContain("onCreateFlowComplete?: () => void;");
        expect(cardForm).toContain("onCreateFlowComplete?.();");
        expect(cardForm).toContain("if (closeOnCreateSuccess) {");
        expect(cardForm).toContain("if (editSource === \"create\" && !editingId) {");
    });

    it("returns to the existing screen after create success or cancel", () => {
        expect(search).toContain("closeOnCreateSuccess");
        expect(cardForm).toContain("setOpen(false);");
        expect(search).not.toMatch(/\brouter\.(push|replace)\(/);
    });

    it("keeps the trainer mounted and does not insert the created card into its active queue", () => {
        expect(layout).toContain("<GlobalOverlays ownerKey={user.id} />");
        expect(globalOverlays).toContain("<GlobalQuickSearch");
        expect(search).toContain("onCreated={(card) => mergeKnownCard(card)}");
        expect(search).not.toContain("loadToday(");
        expect(search).not.toContain("setTodayItems(");
    });

    it("uses the same root-level flow outside the trainer without special route handling", () => {
        expect(layout).toContain("{user ? <GlobalOverlays ownerKey={user.id} /> : null}");
        expect(search).toContain("closeOnCreateSuccess");
        expect(cardForm).toContain("function handleCancelEdit()");
        expect(cardForm).toContain("onClose={handleCancelEdit}");
    });
});
