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

    it("uses compact group selection in vocab create/edit flows", () => {
        expect(trainerSource).toContain("const [formGroupSelectorOpen, setFormGroupSelectorOpen] = useState(false);");
        expect(trainerSource).toContain("open={!isSentenceTrainer && formGroupSelectorOpen}");
        expect(trainerSource).toContain("title=\"Gruppen auswählen\"");
        expect(trainerSource).toContain("formGroupSummary = useMemo(() => visibleBadgeSummary(formSelectedGroups, 2), [formSelectedGroups]);");
        expect(trainerSource).toContain("{isSentenceTrainer ? (");
        expect(trainerSource).toContain("{formSelectedGroups.length > 0 ? \"Gruppen bearbeiten\" : \"➕ Gruppe\"}");
    });

    it("keeps memberships editable with vocab scope and inline group creation", () => {
        expect(trainerSource).toContain("assignedIds={(cards.find((entry: any) => String(entry.id) === String(cardGroupsCardId))?.groups ?? []).map((group: any) => String(group.id))}");
        expect(trainerSource).toContain("allowCreate");
        expect(trainerSource).toContain("fetchGroups(cardType)");
        expect(trainerSource).toContain("assignCardsToGroup(cardType, groupId");
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
