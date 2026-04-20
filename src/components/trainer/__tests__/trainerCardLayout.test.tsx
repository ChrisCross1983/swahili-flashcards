import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerCard from "@/components/trainer/TrainerCard";

describe("trainer card layout", () => {
    it("renders compact front layout before reveal and expanded layout after reveal", () => {
        const compact = renderToStaticMarkup(
            <TrainerCard
                reveal={false}
                prompt="Buch"
                answer="kitabu"
                promptExample="Ich lese **Buch**."
                imagePath={null}
                imageBaseUrl="https://example.com"
            />,
        );

        const expanded = renderToStaticMarkup(
            <TrainerCard
                reveal
                prompt="Buch"
                answer="kitabu"
                promptExample="Ich lese **Buch**."
                answerExample="Ninasoma **kitabu**."
                imagePath={null}
                imageBaseUrl="https://example.com"
                onOpenLearningHelp={() => undefined}
            />,
        );

        expect(compact).toContain('data-layout="compact"');
        expect(compact).not.toContain("Antwort");
        expect(compact).toContain("Beispielsatz anzeigen");
        expect(compact).toContain("prompt-example-toggle");
        expect(compact).not.toContain("prompt-example-content");
        expect(compact).toContain("aria-expanded=\"false\"");
        expect(compact).not.toContain("Ich lese **Buch**.");
        expect(expanded).toContain('data-layout="expanded"');
        expect(expanded).toContain("Antwort");
        expect(expanded).toContain("answer-example-toggle");
        expect(expanded).not.toContain("answer-example-content");
    });

    it("only renders example toggle when an example exists", () => {
        const withoutExample = renderToStaticMarkup(
            <TrainerCard
                reveal={false}
                prompt="Haus"
                answer="nyumba"
                imagePath={null}
                imageBaseUrl="https://example.com"
            />,
        );

        expect(withoutExample).not.toContain("Beispielsatz anzeigen");
    });

    it("keeps notes action on the front side", () => {
        const tips = renderToStaticMarkup(
            <TrainerCard
                reveal
                prompt="Buch"
                answer="kitabu"
                imagePath={null}
                imageBaseUrl="https://example.com"
                onOpenLearningHelp={() => undefined}
            />,
        );

        expect(tips).toContain('data-mode="front"');
        expect(tips).toContain("Eigene Notizen");
        expect(tips).not.toContain("Zur Vorderseite");
    });
});

describe("trainer card example disclosure affordance", () => {
    it("uses a dedicated disclosure row with explicit expanded/collapsed semantics", () => {
        const root = process.cwd();
        const filePath = path.join(root, "src/components/trainer/TrainerCard.tsx");
        const source = fs.readFileSync(filePath, "utf8");

        expect(source).toContain("aria-expanded={open}");
        expect(source).toContain("aria-controls={id}");
        expect(source).toContain("data-testid={`${id}-toggle`}");
        expect(source).toContain("data-tone=\"secondary\"");
        expect(source).toContain("Beispielsatz {open ? \"ausblenden\" : \"anzeigen\"}");
        expect(source).toContain("{open ? \"▾\" : \"▸\"}");
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
