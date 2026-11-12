import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SentenceFormDisclosure, { SentenceFormGroup } from "../SentenceFormDisclosure";

const read = (name: string) => fs.readFileSync(path.join(process.cwd(), name), "utf8");
const form = read("src/components/trainer/TrainerCardFormSheet.tsx");
const styles = read("src/app/globals.css");

describe("word composer", () => {
  it("places audio and groups with the word pair and leaves three learning modules", () => {
    expect(form).toContain('"Wortpaar"');
    expect(form).toContain('className="sentence-textarea word-input mt-2"');
    expect(form).toContain('{!isSentence ? imageFeature : null}');
    expect(form).toContain('className="word-pair-meta"');
    expect(form).toContain('className={isSentence ? "" : "word-edit-fields"}');
    expect(form).toContain('className="word-swahili-control"');
    expect(form).toContain('className={isSentence ? "sentence-pair-card" : "word-edit-core"}');
    expect(form).toContain('className="word-pair-group-chips"');
    expect(form).toContain('className={`word-pair-audio');
    expect(form).toContain('{isSentence ? <SentenceFormDisclosure sentence={isSentence} title="Gruppe"');
    expect(form).toContain('{isSentence ? <SentenceFormDisclosure sentence={isSentence} title="Aussprache"');
    expect(form).toContain('title="Notizen"');
    expect(form).not.toContain('title="Beispiele"');
    expect(form).toContain('title="Gruppe"');
    expect(form).toContain('title="Aussprache"');
    expect(form.indexOf('className="word-pair-meta"')).toBeLessThan(form.indexOf('<SentenceFormGroup sentence={isSentence}>'));
    expect(form).toContain('footer={<div className={isSentence ? "sentence-action-bar" : "sentence-action-bar word-action-bar"}>');
    expect(form).toContain('className={isSentence ? "w-full btn btn-ghost py-3 text-accent-cta" : "word-delete-action"}');
    expect(form).toContain('{isSentence ? "Löschen" : "Karte löschen"}');
    expect(styles).toContain('.word-learning-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }');
    expect(form).toContain('subtitle="Deutsch ↔ Kiswahili"');
  });

  it("only expands one card and keeps mobile, hover, focus, and reduced-motion styles", () => {
    const html = renderToStaticMarkup(<SentenceFormGroup sentence={false}>
      {(["Illustration", "Gruppe", "Notizen"] as const).map((title) =>
        <SentenceFormDisclosure key={title} sentence={false} title={title} open={title === "Notizen"} onToggle={() => {}}><span>{title} Inhalt</span></SentenceFormDisclosure>)}
    </SentenceFormGroup>);
    expect(html).toContain('data-testid="word-feature-grid"');
    expect(html).toContain('class="word-learning-grid"');
    expect((html.match(/aria-expanded="true"/g) ?? [])).toHaveLength(1);
    expect(styles).toContain('.sentence-feature-card:not(.is-open):hover');
    expect(styles).toContain('.sentence-feature-card.is-open');
    expect(styles).toContain('.sentence-feature-trigger:focus-visible');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('env(safe-area-inset-bottom)');
  });
});
