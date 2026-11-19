import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("global mobile tools placement", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/GlobalOverlays.tsx"), "utf8");

    it("keeps mobile tools above the trainer controls at bottom-left", () => {
        expect(source).toContain("data-focused-trainer-tools");
        expect(source).toContain("bottom-[calc(5.75rem+env(safe-area-inset-bottom))]");
        expect(source).toContain("left-[max(0.75rem,env(safe-area-inset-left))]");
        expect(source).toContain('focusedTrainerMode ? "bottom-left" : "bottom-right"');
        expect(source).toContain("bottom-[max(0.75rem,env(safe-area-inset-bottom))]");
    });

    it("does not expose a large invisible hitbox over the lower trainer actions", () => {
        expect(source).toContain("pointer-events-none");
        expect(source).toContain("pointer-events-auto");
        expect(source).toContain("h-11 w-11");
        expect(source).toContain("h-9 w-9");
    });

    it("keeps floating tools below modal overlays while above the trainer sheet", () => {
        expect(source).toContain("z-[125]");
        expect(source).not.toContain("z-[2147483647]");
    });
});
