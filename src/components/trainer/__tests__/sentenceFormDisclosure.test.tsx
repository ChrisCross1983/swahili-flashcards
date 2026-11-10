import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SentenceFormDisclosure, { SentenceFormGroup } from "../SentenceFormDisclosure";
import CompactGroupPicker from "@/components/groups/CompactGroupPicker";

describe("sentence card optional sections", () => {
    const content = <label>Gespeicherte Notiz<input defaultValue="Behalten" /></label>;

    it("shows only a compact summary until opened", () => {
        const closed = renderToStaticMarkup(<SentenceFormDisclosure sentence title="Grammatik verstehen" icon="grammar" featured description="AI zerlegt Satzbau und Wortbestandteile." status="Erklärung vorhanden" open={false} onToggle={() => {}}>{content}</SentenceFormDisclosure>);
        expect(closed).toContain('aria-expanded="false"');
        expect(closed).toContain("Erklärung vorhanden");
        expect(closed).toContain("sentence-feature-card--featured");
        expect(closed).toContain("AI zerlegt Satzbau und Wortbestandteile.");
        expect(closed).toContain("<svg");
        expect(closed).toContain('aria-hidden="true"');
        expect(closed).toContain('inert=""');

        const opened = renderToStaticMarkup(<SentenceFormDisclosure sentence title="Grammatik verstehen" icon="grammar" open onToggle={() => {}}>{content}</SentenceFormDisclosure>);
        expect(opened).toContain('aria-expanded="true"');
        expect(opened).toContain("is-open");
        expect(opened).toContain("sentence-feature-panel");
        expect(opened).toContain('aria-hidden="false"');
        expect(opened).toContain("Gespeicherte Notiz");
    });

    it("shows a focused coachmark only while the grammar card is closed", () => {
        const coachmark = <aside>Grammatik leichter verstehen <button>Ausprobieren</button><button>Später</button></aside>;
        const html = renderToStaticMarkup(<SentenceFormDisclosure sentence title="Grammatik verstehen" icon="grammar" badge="Empfohlen" coachmark={coachmark} open={false} onToggle={() => {}}>{content}</SentenceFormDisclosure>);
        expect(html).toContain("Empfohlen");
        expect(html).toContain("Grammatik leichter verstehen");
        expect(html).toContain("Ausprobieren");
        expect(html).toContain("Später");
        expect(html).toContain('aria-hidden="true"');
        const opened = renderToStaticMarkup(<SentenceFormDisclosure sentence title="Grammatik verstehen" icon="grammar" coachmark={coachmark} open onToggle={() => {}}>{content}</SentenceFormDisclosure>);
        expect(opened).not.toContain("Grammatik leichter verstehen");
        expect(opened).toContain("Gespeicherte Notiz");
    });

    it("places secondary cards in a responsive grid without list dividers", () => {
        const html = renderToStaticMarkup(<SentenceFormGroup sentence><SentenceFormDisclosure sentence title="Notizen" icon="notes" status="Noch keine Notiz" open={false} onToggle={() => {}}>{content}</SentenceFormDisclosure></SentenceFormGroup>);
        expect(html).toContain("sm:grid-cols-2");
        expect(html).toContain("sentence-feature-card");
        expect(html).not.toContain("divide-y");
    });

    it("restores the compact two-column grid when all secondary cards are closed", () => {
        const html = renderToStaticMarkup(<SentenceFormGroup sentence>{["Notizen", "Gruppe", "Aussprache", "Bild"].map((title) =>
            <SentenceFormDisclosure key={title} sentence title={title} open={false} onToggle={() => {}}><span>{title} Inhalt</span></SentenceFormDisclosure>)}</SentenceFormGroup>);
        expect(html).toContain("sm:grid-cols-2");
        expect((html.match(/sentence-feature-card /g) ?? [])).toHaveLength(4);
        expect(html).not.toContain("sm:col-span-2");
        expect(html).not.toContain("is-open");
    });

    it("keeps each opened secondary card full width with the group selection inside", () => {
        const groups = [{ id: "g1", name: "Alltag", color: null }];
        for (const active of ["Notizen", "Gruppe", "Aussprache", "Bild"]) {
            const html = renderToStaticMarkup(<SentenceFormGroup sentence>{["Notizen", "Gruppe", "Aussprache", "Bild"].map((title) =>
                <SentenceFormDisclosure key={title} sentence title={title} open={active === title} onToggle={() => {}}>
                    {title === "Gruppe" ? <CompactGroupPicker inline groups={groups} selectedIds={[]} onChange={() => {}} cardType="sentence" allowCreate /> : <span>{title} Inhalt</span>}
                </SentenceFormDisclosure>)}</SentenceFormGroup>);
            expect(html).toContain("sm:grid-cols-2");
            expect((html.match(/sm:col-span-2/g) ?? [])).toHaveLength(1);
            expect((html.match(/class="sentence-feature-card[^\"]*is-open/g) ?? [])).toHaveLength(1);
            expect(html).toContain('data-inline-group-picker="true"');
            expect(html).not.toContain("data-viewport-safe-group-picker");
            expect(html).not.toContain('class="fixed');
        }
    });

    it("keeps vocabulary supplements collapsed until opened", () => {
        const vocab = renderToStaticMarkup(<SentenceFormDisclosure sentence={false} title="Eigene Notizen" open={false} onToggle={() => {}}>{content}</SentenceFormDisclosure>);
        expect(vocab).toContain("Gespeicherte Notiz");
        expect(vocab).toContain('aria-expanded="false"');
        expect(vocab).toContain("word-feature-card");
    });
});
