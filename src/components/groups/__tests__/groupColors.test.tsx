import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GroupBadge from "@/components/groups/GroupBadge";
import GroupColorPicker from "@/components/groups/GroupColorPicker";
import GroupSelector from "@/components/groups/GroupSelector";
import ManageGroupsSheet from "@/components/groups/ManageGroupsSheet";

describe("group color presentation", () => {
    it("shows a selected, keyboard-focusable, wrapping palette with 44px targets", () => {
        const html = renderToStaticMarkup(<GroupColorPicker value="sage" onChange={() => {}} />);
        expect(html).toContain('aria-label="Farbe Salbei"');
        expect(html).toContain('aria-pressed="true"');
        expect(html).toContain("flex-wrap");
        expect(html).toContain("h-11 w-11");
        expect(html).toContain("focus-visible:ring-2");
        expect(html).toContain("hover:scale-105");
        expect(html).toContain("motion-reduce:transform-none");
        expect((html.match(/aria-label="Farbe /g) ?? [])).toHaveLength(11);
    });

    it("shows a small color dot beside the name and falls back safely for old groups", () => {
        const colored = renderToStaticMarkup(<GroupBadge group={{ name: "Alltag", color: "sage" }} />);
        expect(colored).toContain('data-group-color="sage"');
        expect(colored).toContain("Alltag");
        expect(colored).not.toContain("background-color:#72846b22");
        const legacy = renderToStaticMarkup(<GroupBadge group={{ name: "Alt", color: "#ff0000" }} />);
        expect(legacy).toContain('data-group-color="neutral"');
        expect(legacy).toContain("Alt");
    });

    it("keeps creation available in the existing group selector and colors the sentence summary", () => {
        const html = renderToStaticMarkup(<GroupSelector groups={[]} selectedIds={[]} onChange={() => {}} cardType="sentence" allowCreate />);
        expect(html).toContain("Neue Gruppe erstellen");
        expect(html).toContain('aria-label="Farbe Salbei"');
        const form = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/TrainerCardFormSheet.tsx"), "utf8");
        expect(form).toContain("<GroupColorDot color={group.color} />{group.name}");
        expect(form).toContain('status={formSelectedGroups.length ?');
        expect(form).toContain(': undefined} open={activeSupplement === "group"}');
    });

    it("offers palette selection and later editing in group management", () => {
        const html = renderToStaticMarkup(<ManageGroupsSheet
            open groups={[{ id: "g1", name: "Alltag", color: "blue" }]} cardType="sentence"
            onClose={() => {}} onUpdated={() => {}}
        />);
        expect(html).toContain('aria-label="Farbe Salbei"');
        expect(html).toContain('data-group-color="blue"');
        expect(html).toContain("Bearbeiten");
        const source = fs.readFileSync(path.join(process.cwd(), "src/components/groups/ManageGroupsSheet.tsx"), "utf8");
        expect(source).toContain("{isEditing ? <GroupColorPicker value={editingColor}");
    });
});
