import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("phase 2 product UX cleanup", () => {
    const root = process.cwd();
    const trainerSource = fs.readFileSync(path.join(root, "src/app/trainer/TrainerClient.tsx"), "utf8");
    const homeSource = fs.readFileSync(path.join(root, "src/app/HomeClient.tsx"), "utf8");
    const importSource = fs.readFileSync(path.join(root, "src/app/import/ImportClient.tsx"), "utf8");

    it("uses compact group filtering and inline group editing in list rows", () => {
        expect(trainerSource).toContain("<option value=\"\">Alle Karten</option>");
        expect(trainerSource).toContain("Gruppen bearbeiten");
        expect(trainerSource).toContain("visibleBadgeSummary(c.groups ?? [], 2)");
    });

    it("uses compact group selection in the learning-card and card-edit flows", () => {
        expect(trainerSource).toContain("const [formGroupSelectorOpen, setFormGroupSelectorOpen] = useState(false);");
        expect(trainerSource).toContain("const useCompactFormGroupPicker = !isSentenceTrainer || Boolean(editingId);");
        expect(trainerSource).toContain("open={useCompactFormGroupPicker && formGroupSelectorOpen}");
        expect(trainerSource).toContain("title=\"Gruppen auswählen\"");
        expect(trainerSource).toContain("formGroupSummary = useMemo(() => visibleBadgeSummary(formSelectedGroups, 2), [formSelectedGroups]);");
        expect(trainerSource).toContain("{!useCompactFormGroupPicker ? (");
        expect(trainerSource).toContain("{formSelectedGroups.length > 0 ? \"Gruppen bearbeiten\" : \"➕ Gruppe\"}");
        expect(trainerSource).toContain("onClick={openCurrentCardGroupsEditor}");
        expect(trainerSource).toContain("visibleBadgeSummary(currentItemGroups, 2)");
    });

    it("keeps memberships editable with vocab scope and inline group creation", () => {
        expect(trainerSource).toContain("open={cardGroupsEditorOpen}");
        expect(trainerSource).toContain("selectedIds={cardGroupsDraft}");
        expect(trainerSource).toContain("onChange={setCardGroupsDraft}");
        expect(trainerSource).toContain("allowCreate");
        expect(trainerSource).toContain("Gruppenzuordnung gespeichert.");
        expect(trainerSource).toContain("fetchGroups(cardType)");
        expect(trainerSource).toContain("assignCardsToGroup(cardType, groupId");
    });

    it("uses notes sheet with single field and forgiving persistence", () => {
        expect(trainerSource).toContain("title=\"Eigene Notizen\"");
        expect(trainerSource).toContain("setCardNoteDraft({ mainNotes:");
        expect(trainerSource).toContain("Automatisch gespeichert");
        expect(trainerSource).not.toContain("onFlipBack");
    });

    it("prevents search overlay from mutating zoom or transform state", () => {
        const searchSource = fs.readFileSync(path.join(root, "src/components/GlobalQuickSearch.tsx"), "utf8");
        expect(searchSource).toContain("lockBodyScroll()");
        expect(searchSource).not.toContain("html.style.transform");
        expect(searchSource).not.toContain("zoom = \"1\"");
    });

    it("uses stronger layering and local close controls for sheets", () => {
        const sheetSource = fs.readFileSync(path.join(root, "src/components/FullScreenSheet.tsx"), "utf8");
        expect(sheetSource).toContain("bg-overlay");
        expect(sheetSource).toContain("md:rounded-3xl");
        expect(sheetSource).toContain("aria-label=\"Schließen\"");
    });

    it("reduces mobile floating tool obstruction in focused trainer mode", () => {
        const overlaysSource = fs.readFileSync(path.join(root, "src/components/GlobalOverlays.tsx"), "utf8");
        expect(overlaysSource).toContain("focusedTrainerMode");
        expect(overlaysSource).toContain("mobileToolsOpen");
        expect(overlaysSource).toContain("if (focusedTrainerMode)");
        expect(overlaysSource).toContain("{mobileToolsOpen ? (");
        expect(overlaysSource).not.toContain("!focusedTrainerMode || mobileToolsOpen");
        expect(overlaysSource).toContain("Schnellaktionen öffnen");
    });

    it("keeps bulk import out of home and available in vocab trainer", () => {
        expect(homeSource).not.toContain("Bulk Import");
        expect(trainerSource).toContain('router.push("/import")');
    });

    it("simplifies import review row actions and keeps explicit states", () => {
        expect(importSource).toContain("Akzeptieren");
        expect(importSource).toContain("Weniger Optionen");
        expect(importSource).not.toContain(">Übernehmen<");
        expect(importSource).toContain("⚠️ Prüfen");
    });

    it("removes redundant local search tile entry", () => {
        expect(trainerSource).not.toContain("Satz suchen");
        expect(trainerSource).not.toContain("Karte suchen");
        expect(trainerSource).not.toContain("Search Modal");
    });
});
