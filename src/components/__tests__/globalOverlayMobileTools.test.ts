import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("global mobile tools placement", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/GlobalOverlays.tsx"), "utf8");

    it("keeps mobile tools visible but moves them top-right during focused trainer sessions", () => {
        expect(source).toContain("data-focused-trainer-tools");
        expect(source).toContain("top-[max(4.5rem,calc(env(safe-area-inset-top)+4.5rem))]");
        expect(source).toContain("bottom-[max(0.75rem,env(safe-area-inset-bottom))]");
    });

    it("does not expose a large invisible hitbox over the lower trainer actions", () => {
        expect(source).toContain("pointer-events-none");
        expect(source).toContain("pointer-events-auto");
        expect(source).toContain("w-11");
    });
});
