import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("phase 2 product UX cleanup", () => {
    const root = process.cwd();
    const trainerSource = fs.readFileSync(path.join(root, "src/app/trainer/TrainerClient.tsx"), "utf8");
    const trainerCardFormSource = fs.readFileSync(path.join(root, "src/components/trainer/TrainerCardFormSheet.tsx"), "utf8");
    const trainerCardLibrarySource = fs.readFileSync(path.join(root, "src/components/trainer/TrainerCardLibrarySheet.tsx"), "utf8");
    const trainerSetupViewSource = fs.readFileSync(path.join(root, "src/components/trainer/TrainerSetupView.tsx"), "utf8");
    const trainerSetupHookSource = fs.readFileSync(path.join(root, "src/lib/trainer/useTrainerSetup.ts"), "utf8");
    const compactGroupPickerSource = fs.readFileSync(path.join(root, "src/components/groups/CompactGroupPicker.tsx"), "utf8");
    const homeSource = fs.readFileSync(path.join(root, "src/app/HomeClient.tsx"), "utf8");
    const importSource = fs.readFileSync(path.join(root, "src/app/import/ImportClient.tsx"), "utf8");

    it("uses compact group filtering and inline group editing in list rows", () => {
        expect(trainerCardLibrarySource).toContain("<option value=\"\">Alle Karten</option>");
        expect(trainerCardLibrarySource).toContain("Gruppen bearbeiten");
        expect(trainerCardLibrarySource).toContain("visibleBadgeSummary(card.groups ?? [], 2)");
    });

    it("uses compact group selection in the learning-card and card-edit flows", () => {
        expect(trainerSource).toContain("import CompactGroupPicker from \"@/components/groups/CompactGroupPicker\";");
        expect(trainerSource).toContain("import TrainerCardFormSheet");
        expect(trainerSource).not.toContain("const [formGroupSelectorOpen, setFormGroupSelectorOpen] = useState(false);");
        expect(trainerCardFormSource).toContain("formGroupSummary = useMemo(() => visibleBadgeSummary(formSelectedGroups, 2), [formSelectedGroups]);");
        expect(trainerCardFormSource).toContain("<CompactGroupPicker");
        expect(compactGroupPickerSource).toContain("aria-multiselectable=\"true\"");
        expect(compactGroupPickerSource).toContain("aria-selected={isSelected}");
        expect(trainerCardFormSource).toContain("{formSelectedGroups.length > 0 ? \"Gruppen bearbeiten\" : \"➕ Gruppe\"}");
        expect(trainerSource).toContain("onClick={openCurrentCardGroupsEditor}");
        expect(trainerSource).toContain("visibleBadgeSummary(currentItemGroups, 2)");
    });

    it("keeps memberships editable with vocab scope and inline group creation", () => {
        expect(trainerSource).toContain("open={cardGroupsEditorOpen}");
        expect(trainerSource).toContain("selectedIds={cardGroupsDraft}");
        expect(trainerSource).toContain("onChange={setCardGroupsDraft}");
        expect(trainerSource).toContain("cardGroupsSummary = useMemo(() => visibleBadgeSummary(cardGroupsSelected, 2), [cardGroupsSelected]);");
        expect(trainerSource).toContain("allowCreate");
        expect(trainerSource).toContain("Gruppenzuordnung gespeichert.");
        expect(trainerSource).toContain("fetchGroups(cardType)");
        expect(trainerSource).toContain("assignCardsToGroup(cardType, groupId");
    });

    it("uses notes sheet with single field and forgiving persistence", () => {
        expect(trainerSource).toContain("<CompactOverlay");
        expect(trainerSource).toContain("title=\"Eigene Notizen\"");
        expect(trainerSource).toContain("setCardNoteDraft({ mainNotes:");
        expect(trainerSource).toContain("Automatisch gespeichert");
        expect(trainerSource).toContain("const closeNotesSheet = useCallback");
        expect(trainerSource).toContain("const handleNotesOverlayClose = useCallback");
        expect(trainerSource).toContain("onClose={handleNotesOverlayClose}");
        expect(trainerSource).not.toMatch(/<FullScreenSheet\s+open=\{notesSheetOpen\}/);
        expect(trainerSource).not.toContain("onFlipBack");
    });

    it("keeps create/edit flow progressive with optional examples collapsed behind disclosure", () => {
        expect(trainerCardFormSource).toContain("Schritt 1 · Kartenpaar");
        expect(trainerCardFormSource).toContain("Schritt 2 · Optionaler Kontext");
        expect(trainerCardFormSource).toContain("Optional: Beispielsätze hinzufügen");
        expect(trainerCardFormSource).toContain("setOptionalExamplesOpen((isOpen) => !isOpen)");
        expect(trainerCardFormSource).toContain("aria-expanded={optionalExamplesOpen}");
        expect(trainerCardFormSource).toContain("data-testid=\"optional-examples-section\"");
        expect(trainerCardFormSource).toContain("Beispielsatz Deutsch (optional)");
        expect(trainerCardFormSource).toContain("Beispielsatz Swahili (optional)");
    });

    it("keeps emphasis tools available but visually secondary", () => {
        const exampleFieldSource = fs.readFileSync(path.join(root, "src/components/ExampleField.tsx"), "utf8");
        expect(exampleFieldSource).toContain("Text hervorheben");
        expect(exampleFieldSource).toContain("aria-expanded={revealTools}");
        expect(exampleFieldSource).toContain("data-testid=\"example-emphasis-tools\"");
        expect(exampleFieldSource).toContain("Fett");
        expect(exampleFieldSource).toContain("Unterstreichen");
        expect(exampleFieldSource).toContain("Markieren");
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
        expect(overlaysSource).toContain("bottom-[max(0.75rem,env(safe-area-inset-bottom))]");
        expect(overlaysSource).toContain("right-[max(0.75rem,env(safe-area-inset-right))]");
        expect(overlaysSource).toContain("border-white/50 bg-accent-secondary text-white");
        expect(overlaysSource).toContain("Schnellaktionen öffnen");
    });

    it("keeps bulk import out of home and available in vocab trainer", () => {
        expect(homeSource).not.toContain("Bulk Import");
        expect(trainerSource).toContain('router.push("/import")');
    });

    it("keeps home calm and routes learning tile to trainer setup", () => {
        expect(homeSource).not.toContain('"/trainer?quickStart=today"');
        expect(homeSource).not.toContain('"/trainer?quickStart=all"');
        expect(homeSource).not.toContain("Auswahl öffnen");
        expect(homeSource).toContain('router.push("/trainer")');
        expect(trainerSource).toContain("setEntryQuickStartPreset(quickStart)");
        expect(trainerSource).toContain("resetTrainingPreset(quickStart)");
        expect(trainerSource).toContain("setOpenLearn(true)");
        expect(trainerSource).toContain("params.delete(\"quickStart\")");
        expect(trainerSource).toContain("router.replace(query ? `${pathname}?${query}` : pathname)");
    });

    it("uses one clear trainer start sequence without advanced options toggles", () => {
        expect(trainerSource).toContain("selectedPreset");
        expect(trainerSource).toContain("useTrainerSetup");
        expect(trainerSource).not.toContain("hasAutoOpenedSetupRef");
        expect(trainerSource).toContain("onClick={() => {");
        expect(trainerSource).toContain("setOpenLearn(true);");
        expect(trainerSetupViewSource).toContain("aria-pressed={selectedPreset === \"today\"}");
        expect(trainerSetupViewSource).toContain("aria-pressed={selectedPreset === \"all\"}");
        expect(trainerSetupViewSource).toContain("aria-pressed={selectedPreset === \"last-missed\"}");
        expect(trainerSetupViewSource).toContain("Fehlerpool der letzten 7 Tage.");
        expect(trainerSetupViewSource).toContain("Session starten ·");
        expect(trainerSetupViewSource).toContain("Empfohlen für dich:");
        expect(trainerSource).not.toContain("runQuickStart(");
        expect(trainerSource).not.toContain("Start mit diesen Optionen");
        expect(trainerSource).not.toContain("Optionen einblenden");
        expect(trainerSource).not.toContain("Optionen ausblenden");
        expect(trainerSource).not.toContain("Mehr Kontrolle");
        expect(trainerSource).not.toContain("Weniger Kontrolle");
    });

    it("removes redundant advanced learning-method controls and duplicate setup CTA", () => {
        expect(trainerSource).not.toContain("text-sm font-semibold text-primary\">Lernmethode");
        expect(trainerSource).toContain("selectedSessionConfig");
        expect(trainerSource).toContain("learnMode: selectedSessionConfig.learnMode");
        expect((trainerSetupViewSource.match(/Session starten ·/g) ?? []).length).toBe(1);
    });

    it("keeps material refinement only for all-cards mode and removes duplicate last-missed material choice", () => {
        expect(trainerSetupViewSource).toContain("selectedPreset === \"all\" ? <div");
        expect(trainerSetupViewSource).toContain("Trainingsmaterial:");
        expect(trainerSetupViewSource).toContain("{ kind: \"GROUP\", groupId: event.target.value }");
        expect(trainerSetupViewSource).toContain("{ kind: \"ALL\" }");
        expect(trainerSetupViewSource).not.toContain("<option value=\"LAST_MISSED\">");
        expect(trainerSetupViewSource).toContain("Session starten · {selectedPresetSummary} ({selectedPresetCount})");
        expect(trainerSource).not.toContain("text-sm font-semibold text-primary\">Material");
        expect(trainerSource).not.toContain("Material auswählen");
    });

    it("keeps direction visible in main start flow with accessible selected states", () => {
        expect(trainerSetupViewSource).toContain("text-sm font-semibold text-primary\">Abfragerichtung");
        expect(trainerSetupViewSource).toContain("aria-pressed={directionMode === \"DE_TO_SW\"}");
        expect(trainerSetupViewSource).toContain("aria-pressed={directionMode === \"SW_TO_DE\"}");
        expect(trainerSetupViewSource).toContain("aria-pressed={directionMode === \"RANDOM\"}");
        expect(trainerSetupViewSource).toContain("onDirectionModeChange(\"RANDOM\")");
    });

    it("updates selected preset on card selection without immediate session start", () => {
        expect(trainerSetupViewSource).toContain("onClick={() => onSelectPreset(\"today\")}");
        expect(trainerSetupViewSource).toContain("onClick={() => onSelectPreset(\"all\")}");
        expect(trainerSetupViewSource).toContain("onClick={() => onSelectPreset(\"last-missed\")}");
        expect(trainerSetupHookSource).toContain("if (nextPreset === \"all\") return;");
        expect(trainerSetupHookSource).toContain("onTrainingMaterialChange({ kind: \"ALL\" });");
        expect(trainerSource).not.toContain("onClick={() => void startLearningSession({ learnMode: \"LEITNER_TODAY\"");
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

    it("keeps exactly one start CTA and start readiness guard", () => {
        expect((trainerSetupViewSource.match(/Session starten ·/g) ?? []).length).toBe(1);
        expect(trainerSource).toContain("startDisabled");
        expect(trainerSource).toContain("startHint");
    });

    it("keeps trainer sheet fullscreen on mobile while preserving desktop framing", () => {
        const sheetSource = fs.readFileSync(path.join(root, "src/components/FullScreenSheet.tsx"), "utf8");
        expect(sheetSource).toContain("h-[100dvh]");
        expect(sheetSource).toContain("max-w-none");
        expect(sheetSource).toContain("border-0");
        expect(sheetSource).toContain("md:max-w-2xl");
        expect(sheetSource).toContain("md:rounded-3xl");
        expect(sheetSource).toContain("md:border");
    });
});
