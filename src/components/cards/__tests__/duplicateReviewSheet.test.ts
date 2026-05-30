import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DuplicateReviewSheet safety wiring", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/cards/DuplicateReviewSheet.tsx"), "utf8");
    const confirmSource = fs.readFileSync(path.join(process.cwd(), "src/components/ConfirmDialog.tsx"), "utf8");

    it("does not preselect delete candidates after scanning", () => {
        expect(source).toContain("setSelectedDeleteIds({});");
        expect(source).not.toContain("const keepId = cluster.recommendation?.keepCardId");
        expect(source).not.toContain("filter((id) => id !== keepId)");
    });

    it("keeps delete disabled until manual selection and labels selection explicitly", () => {
        expect(source).toContain("disabled={deleting || selectedCount === 0 || clusters.length === 0}");
        expect(source).toContain("Bitte Karten zum Löschen auswählen.");
        expect(source).toContain("Zum Löschen auswählen:");
        expect(source).toContain("Karten werden nur gelöscht, wenn du sie manuell auswählst.");
        expect(source).toContain("Verdächtige ähnliche Karten");
        expect(source).toContain("Bitte manuell prüfen, bevor du löschst.");
    });

    it("validates only selected clusters and posts selected ids to the duplicate delete route", () => {
        expect(source).toContain("validateClusterDeletionSelections(");
        expect(source).toContain('fetch("/api/cards/duplicates/delete"');
        expect(source).toContain("body: JSON.stringify({ cardIds: selectedIds })");
    });

    it("renders confirmation above sheets and compact overlays", () => {
        expect(confirmSource).toContain("z-[160]");
        expect(confirmSource).not.toContain("z-50");
    });
});
