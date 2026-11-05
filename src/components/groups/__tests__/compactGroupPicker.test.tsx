import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CompactGroupPicker from "@/components/groups/CompactGroupPicker";

const groups = [
    { id: "g1", name: "Alltag", color: "sage" },
    { id: "g2", name: "Verben", color: null },
];

describe("CompactGroupPicker", () => {
    it("retains viewport-safe positioning outside sentence cards and offers an inline mode", () => {
        const source = fs.readFileSync(path.join(process.cwd(), "src/components/groups/CompactGroupPicker.tsx"), "utf8");

        expect(source).toContain("data-viewport-safe-group-picker");
        expect(source).toContain(': "fixed inset-x-3');
        expect(source).toContain("data-inline-group-picker");
        expect(source).toContain("max-h-[calc(100dvh-6rem)]");
        expect(source).toContain("z-[135]");
        expect(source).toContain("aria-controls={open ? panelId : undefined}");
        expect(source).not.toContain("absolute right-0 top-full");
    });

    it("keeps selected group state accessible in static markup", () => {
        const html = renderToStaticMarkup(
            <CompactGroupPicker
                groups={groups}
                selectedIds={["g1"]}
                onChange={vi.fn()}
                cardType="vocab"
                triggerLabel="Gruppen bearbeiten"
            />,
        );

        expect(html).toContain("Gruppen bearbeiten");
        expect(html).toContain("aria-haspopup=\"listbox\"");
        expect(html).toContain("aria-expanded=\"false\"");
    });

    it("renders one inline selection with selected, clear and create options", () => {
        const html = renderToStaticMarkup(<CompactGroupPicker
            inline groups={groups} selectedIds={["g1"]} onChange={vi.fn()} cardType="sentence" allowCreate
        />);
        expect(html).toContain('data-inline-group-picker="true"');
        expect(html).not.toContain("data-viewport-safe-group-picker");
        expect(html).not.toContain('class="fixed');
        expect(html).not.toContain("Gruppen wählen");
        expect(html).toContain('role="listbox"');
        expect(html).toContain('aria-selected="true"');
        expect(html).toContain("Keine Gruppe");
        expect(html).toContain("Alltag");
        expect(html).toContain('data-group-color="sage"');
        expect(html).toContain("Verben");
        expect(html).toContain("Neue Gruppe erstellen");
        expect(html).toContain('aria-label="Farbe Salbei"');
        expect(html.match(/data-inline-group-picker/g)).toHaveLength(1);
    });
});
