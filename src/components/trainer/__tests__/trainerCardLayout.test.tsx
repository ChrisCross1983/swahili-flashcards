import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerCard from "@/components/trainer/TrainerCard";
import TrainerStatus from "@/components/trainer/TrainerStatus";
import GroupBadge from "@/components/groups/GroupBadge";

describe("trainer card layout", () => {
    it("keeps an existing illustration out of the initial markup until reveal for words and sentences", () => {
        for (const prompt of ["Hund", "Der Hund schläft."]) {
            const render = (reveal: boolean) => renderToStaticMarkup(<TrainerCard
                reveal={reveal} prompt={prompt} answer="mbwa" imagePath="dog.webp"
                imageBaseUrl="https://example.com/images"
            />);
            const front = render(false);
            expect(front).not.toContain("Kartenbild");
            expect(front).not.toContain("dog.webp");
            expect(render(true)).toContain('src="https://example.com/images/dog.webp"');
        }
    });

    it("places vocabulary learning actions before the compact stored image without an empty placeholder", () => {
        const render = (reveal: boolean, imagePath: string | null) => renderToStaticMarkup(<TrainerCard
            reveal={reveal} prompt="Ein sehr langes zusammenhängendes Vokabelwort" answer="Übersetzung"
            imagePath={imagePath} imageBaseUrl="https://example.com/images" compactVocabExtras
            learningFeature={reveal ? <div data-testid="learning-actions">Lernhilfen</div> : null}
        />);
        const front = render(false, "word.webp");
        const back = render(true, "word.webp");
        expect(front).not.toContain('data-testid="trainer-inline-image"');
        expect(back).toContain('data-testid="trainer-inline-image"');
        expect(back.indexOf("Übersetzung")).toBeLessThan(back.indexOf('data-testid="trainer-inline-image"'));
        expect(back.indexOf('data-testid="learning-actions"')).toBeLessThan(back.indexOf('data-testid="trainer-inline-image"'));
        expect(back).toContain("object-contain");
        expect(back).toContain("h-[clamp(9.375rem,20dvh,11.25rem)]");
        expect(back).toContain('aria-label="Kartenbild vergrößern"');
        expect(back).toContain("[overflow-wrap:anywhere]");
        expect(render(true, null)).not.toContain('data-testid="trainer-inline-image"');
    });

    it("keeps progress, direction and the vocabulary edit action in the compact session header", () => {
        const html = renderToStaticMarkup(<TrainerStatus currentNumber={1} sessionTotal={100} answeredCount={0} safePct={0}
            direction="DE_TO_SW" directionMode="RANDOM" onToggleDirectionMenu={() => undefined} onEditCard={() => undefined} />);
        expect(html).toContain('data-testid="trainer-session-status"');
        expect(html).toContain('data-card-option-action="edit"');
        expect(html).toContain("1 <span");
        expect(html).toContain("100");
        expect(html).toContain("Richtung:");
        expect(html).toContain("Zufällig");
        expect(html).toContain("Richtung ändern");
    });

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
        expect(compact).toContain('data-focus-role="recall-card"');
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

    it("does not offer the separate legacy example flow on vocabulary cards", () => {
        const vocab = renderToStaticMarkup(<TrainerCard
            reveal prompt="Buch" answer="kitabu" promptExample="Altes Beispiel"
            answerExample="Old example" showExamples={false} imagePath={null} imageBaseUrl="https://example.com"
        />);
        expect(vocab).not.toContain("Beispielsatz anzeigen");
        expect(vocab).not.toContain("Altes Beispiel");
        expect(vocab).not.toContain("Old example");
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
        expect(tips).toContain('data-testid="learning-secondary-actions"');
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
    it("renders active-card group badges as passive non-button information", () => {
        const html = renderToStaticMarkup(<GroupBadge group={{ name: "Sehr lange Alltagsgruppe mit vielen Details", color: null }} quiet />);

        expect(html).toContain('data-role="group-badge"');
        expect(html).toContain('data-interactive="false"');
        expect(html).toContain("Sehr lange Alltagsgruppe mit vielen Details");
        expect(html).toContain('title="Sehr lange Alltagsgruppe mit vielen Details"');
        expect(html).toContain("max-w-[min(12rem,52vw)]");
        expect(html).toContain("truncate");
        expect(html).not.toContain("<button");
        expect(html).not.toContain("shadow-soft");
    });

    it("keeps maintenance controls quieter than recall actions while accessible", () => {
        const root = process.cwd();
        const filePath = path.join(root, "src/app/trainer/TrainerClient.tsx");
        const source = fs.readFileSync(filePath, "utf8");

        expect(source).toContain('data-testid="active-learning-focus"');
        expect(source).toContain('data-testid="card-compact-actions"');
        expect(source).not.toContain('data-testid="card-maintenance-strip"');
        expect(source).not.toContain('aria-label="Weitere Kartenaktionen"');
        expect(source).toContain('data-card-option-action="edit"');
        expect(source).toContain('aria-label="Karte bearbeiten"');
        expect(source).toContain('data-card-option-action="groups"');
        expect(source).toContain('onEditCard={cardType === "vocab" ? startEditFromLearn : undefined}');
        expect(source).toContain('"Gruppen bearbeiten" : "Gruppe hinzufügen"');
        expect(source).toContain('"+ Gruppe"');
        expect(source).toContain('onClick={openCurrentCardGroupsEditor}');
        expect(source).toContain('onClick={startEditFromLearn}');
        const actions = source.slice(source.indexOf('data-testid="card-compact-actions"'), source.indexOf("learningTypeLabel={null}"));
        expect(actions).toContain('data-focus-role="technical-context"');
        expect(actions).toContain("<TrainerLeitnerInfo");
        expect(actions).toContain("hover:shadow-soft");
        expect(actions).toContain("active:scale-[0.97]");
        expect(actions).toContain("focus-visible:ring-2");
        expect(actions).toContain("min-h-11");
        expect(actions).toContain("h-11 w-11");
        expect(source).toContain("Leitner · Stufe");
    });

    it("marks answer controls as primary learning actions", () => {
        const root = process.cwd();
        const filePath = path.join(root, "src/components/trainer/TrainerControls.tsx");
        const source = fs.readFileSync(filePath, "utf8");

        expect(source).toContain('data-focus-role="primary-learning-action"');
        expect(source).toContain("Aufdecken");
        expect(source).toContain("Nicht gewusst");
        expect(source).toContain("Gewusst");
    });
});
