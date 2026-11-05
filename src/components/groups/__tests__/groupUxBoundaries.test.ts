import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const client = fs.readFileSync(path.join(root, "src/app/trainer/TrainerClient.tsx"), "utf8");
const form = fs.readFileSync(path.join(root, "src/components/trainer/TrainerCardFormSheet.tsx"), "utf8");
const picker = fs.readFileSync(path.join(root, "src/components/groups/CompactGroupPicker.tsx"), "utf8");
const manager = fs.readFileSync(path.join(root, "src/components/groups/ManageGroupsSheet.tsx"), "utf8");

describe("group UX boundaries", () => {
    it("keeps sentence group assignment inline without a nested manager", () => {
        expect(form).toContain("inline={isSentence}");
        expect(form).toContain('triggerLabel={isSentence ? "Gruppe wählen"');
        expect(picker).toContain("data-inline-group-picker");
        expect(picker).toContain("Neue Gruppe erstellen");
        expect(picker).toContain("onChange([])");
        expect(picker).toContain('inline && cardType === "sentence" ? [created.id]');
        expect(client).toContain('{cardType !== "sentence" ? <button');
    });

    it("starts each central manager opening with fresh local editing state", () => {
        expect(client).toContain('key={manageGroupsOpen ? "groups-open-session" : "groups-closed-session"}');
        expect(manager).toContain('title="Gruppen verwalten"');
        expect(manager).toContain("setEditingId(group.id)");
        expect(manager).toContain("setEditingColor(isGroupColorKey(group.color) ? group.color : null)");
    });
});
