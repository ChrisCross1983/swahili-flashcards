import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SentenceFormDisclosure, { SentenceFormGroup } from "../SentenceFormDisclosure";

const read = (name: string) => fs.readFileSync(path.join(process.cwd(), name), "utf8");
const form = read("src/components/trainer/TrainerCardFormSheet.tsx");
const styles = read("src/app/globals.css");

describe("word composer", () => {
  it("uses a word pair, illustration-first feature cards, and a fixed mobile action footer", () => {
    expect(form).toContain('"Wortpaar"');
    expect(form).toContain('className="sentence-textarea word-input mt-2"');
    expect(form).toContain('{!isSentence ? imageFeature : null}');
    expect(form.indexOf('{!isSentence ? imageFeature : null}')).toBeLessThan(form.indexOf('title="Gruppe"'));
    expect(form).toContain('title="Notizen"');
    expect(form).not.toContain('title="Beispiele"');
    expect(form).toContain('title="Gruppe"');
    expect(form).toContain('title="Aussprache"');
    expect(form.indexOf('title="Gruppe"')).toBeLessThan(form.indexOf('title="Aussprache"'));
    expect(form.indexOf('title="Aussprache"')).toBeLessThan(form.indexOf('{!isSentence ? notesFeature : null}'));
    expect(form).toContain('footer={<div className="sentence-action-bar">');
    expect(form).toContain('subtitle="Deutsch ↔ Kiswahili"');
  });

  it("only expands one card and keeps mobile, hover, focus, and reduced-motion styles", () => {
    const html = renderToStaticMarkup(<SentenceFormGroup sentence={false}>
      {(["Illustration", "Gruppe", "Notizen"] as const).map((title) =>
        <SentenceFormDisclosure key={title} sentence={false} title={title} open={title === "Notizen"} onToggle={() => {}}><span>{title} Inhalt</span></SentenceFormDisclosure>)}
    </SentenceFormGroup>);
    expect(html).toContain('data-testid="word-feature-grid"');
    expect((html.match(/aria-expanded="true"/g) ?? [])).toHaveLength(1);
    expect(styles).toContain('.sentence-feature-card:not(.is-open):hover');
    expect(styles).toContain('.sentence-feature-card.is-open');
    expect(styles).toContain('.sentence-feature-trigger:focus-visible');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('env(safe-area-inset-bottom)');
  });
});
