import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mobile overlay viewport stability", () => {
    it("blurs active controls on overlay close and does not mutate transform or zoom", () => {
        const overlayLock = fs.readFileSync(path.join(process.cwd(), "src/lib/ui/overlayLock.ts"), "utf8");
        const compact = fs.readFileSync(path.join(process.cwd(), "src/components/CompactOverlay.tsx"), "utf8");
        const quickSearch = fs.readFileSync(path.join(process.cwd(), "src/components/GlobalQuickSearch.tsx"), "utf8");

        expect(overlayLock).toContain("blurActiveOverlayElement");
        expect(overlayLock).toContain("active.blur()");
        expect(compact).toContain("blurActiveOverlayElement();");
        expect(quickSearch).toContain("blurActiveOverlayElement();");

        for (const source of [overlayLock, compact, quickSearch]) {
            expect(source).not.toContain(".style.transform");
            expect(source).not.toContain(".style.zoom");
            expect(source).not.toContain("autoFocus");
        }
    });

    it("keeps mobile text inputs at 16px-equivalent sizing", () => {
        const quickSearch = fs.readFileSync(path.join(process.cwd(), "src/components/GlobalQuickSearch.tsx"), "utf8");
        const trainer = fs.readFileSync(path.join(process.cwd(), "src/app/trainer/TrainerClient.tsx"), "utf8");

        expect(quickSearch).toContain("text-base md:text-sm");
        expect(trainer).toContain("text-base text-primary md:text-sm");
    });
});
