import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerCard from "@/components/trainer/TrainerCard";

describe("trainer card two-mode layout", () => {
    it("renders compact front layout before reveal and expanded layout after reveal", () => {
        const compact = renderToStaticMarkup(
            <TrainerCard
                reveal={false}
                prompt="Buch"
                answer="kitabu"
                imagePath={null}
                imageBaseUrl="https://example.com"
                isFlipped={false}
            />,
        );

        const expanded = renderToStaticMarkup(
            <TrainerCard
                reveal
                prompt="Buch"
                answer="kitabu"
                imagePath={null}
                imageBaseUrl="https://example.com"
                isFlipped={false}
                onOpenLearningHelp={() => undefined}
            />,
        );

        expect(compact).toContain('data-layout="compact"');
        expect(compact).not.toContain("Antwort");
        expect(expanded).toContain('data-layout="expanded"');
        expect(expanded).toContain("Antwort");
    });

    it("uses personal notes label in the second mode", () => {
        const tips = renderToStaticMarkup(
            <TrainerCard
                reveal
                prompt="Buch"
                answer="kitabu"
                imagePath={null}
                imageBaseUrl="https://example.com"
                isFlipped
                onFlipBack={() => undefined}
                backContent={<div>Tip content</div>}
            />,
        );

        expect(tips).toContain('data-mode="notes"');
        expect(tips).toContain("Eigene Notizen");
        expect(tips).toContain("Zur Vorderseite");
        expect(tips.match(/Zur Vorderseite/g)?.length ?? 0).toBe(1);
        expect(tips).not.toContain("Karte umdrehen");
    });
});

describe("trainer action and group metadata layout", () => {
    it("keeps tools row separate from group metadata row", () => {
        const root = process.cwd();
        const filePath = path.join(root, "src/app/trainer/TrainerClient.tsx");
        const source = fs.readFileSync(filePath, "utf8");

        expect(source).toContain("Audio vorhanden");
        expect(source).toContain("Keine Gruppe");
        expect(source).toContain("rounded-xl border border-soft bg-surface-elevated");
    });
});
