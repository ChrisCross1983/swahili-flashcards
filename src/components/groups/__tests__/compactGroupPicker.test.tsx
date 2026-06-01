import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CompactGroupPicker from "@/components/groups/CompactGroupPicker";

const groups = [
    { id: "g1", name: "Alltag", color: null },
    { id: "g2", name: "Verben", color: null },
];

describe("CompactGroupPicker", () => {
    it("uses viewport-safe fixed positioning instead of sheet-clipped absolute placement", () => {
        const source = fs.readFileSync(path.join(process.cwd(), "src/components/groups/CompactGroupPicker.tsx"), "utf8");

        expect(source).toContain("data-viewport-safe-group-picker");
        expect(source).toContain("className=\"fixed inset-x-3");
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
});
