import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FullScreenSheet from "../../FullScreenSheet";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const form = read("src/components/trainer/TrainerCardFormSheet.tsx");
const sheet = read("src/components/FullScreenSheet.tsx");
const disclosure = read("src/components/trainer/SentenceFormDisclosure.tsx");
const styles = read("src/app/globals.css");

describe("sentence composer design and interaction contracts", () => {
  it("keeps the sentence pair prominent and the grammar card ahead of a responsive feature grid", () => {
    expect(form).toContain('presentation="sentence"');
    expect(form).toContain('subtitle="Deutsch ↔ Kiswahili"');
    expect(form).toContain("sentence-pair-card");
    expect(form).toContain('icon="grammar" featured');
    expect(disclosure).toContain("sm:grid-cols-2");
    expect(disclosure).not.toContain("divide-y");
    expect(sheet).toContain("md:max-w-3xl");
    expect(form).toContain("sentence-action-bar");
    expect(form).toContain("<CompactGroupPicker");
  });

  it("provides hover, open, focus, disabled, and reduced-motion states", () => {
    expect(styles).toContain(".sentence-feature-card:not(.is-open):hover");
    expect(styles).toContain(".sentence-feature-card.is-open");
    expect(styles).toContain(".sentence-feature-trigger:focus-visible");
    expect(styles).toContain(".sentence-textarea:focus-visible");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(form).toContain("disabled={!german.trim() || !swahili.trim()");
  });

  it("anchors a one-time coachmark to grammar with both actions", () => {
    expect(form).toContain("sentence-grammar-coachmark");
    expect(form).toContain("Grammatik leichter verstehen");
    expect(form).toContain("Ausprobieren");
    expect(form).toContain("Später");
    expect(form).toContain("window.localStorage.setItem(GRAMMAR_TIP_SEEN_KEY");
    expect(form).toContain("sentence-grammar-tip-seen-v2");
    expect(form).toContain("grammarCardRef.current");
    expect(form).toContain("scroll.scrollBy({ top: target.bottom - viewport.bottom + 24");
    expect(form).toContain("markGrammarTipSeen(); setActiveSupplement(\"grammar\")");
  });

  it("shows one sentence duplicate banner before the pair and offers useful actions", () => {
    expect(form).toContain('data-testid="sentence-duplicate-warning"');
    expect(form).toContain("Vorhandene Karte öffnen");
    expect(form).toContain("Eingabe ändern");
    expect(form.indexOf("{isSentence ? duplicateFeedbackPanel : null}")).toBeLessThan(form.indexOf("sentence-pair-card"));
    expect(form).toContain('isSentence && (duplicateCheckKind === "strict" || duplicateCheckKind === "failure") ? null');
  });

  it("keeps language swap advisory and preserves success and error feedback", () => {
    expect(form).toContain("Deutsch und Kiswahili scheinen vertauscht zu sein.");
    expect(form).toContain("Felder tauschen");
    expect(form).toContain("swapSentencePair({ german, swahili })");
    expect(form).toContain("languageSaveBlocked");
    expect(form).toContain("shouldCheckSentenceLanguages(isSentence, german, swahili)");
    expect(form).toContain("media.generationLoading || Boolean(media.generatedPreview) || explanationLoading || languageSaveBlocked}");
    expect(form).toContain('fetch("/api/sentence/language-check"');
    expect(form).toContain("Bitte korrigiere zuerst die Sprachzuordnung.");
    expect(form).toContain('{isSentence ? "Satz" : "Wort"} gespeichert');
    expect(form).toContain('aria-invalid={explanationFieldError === "german"}');
    expect(form).toContain('aria-invalid={explanationFieldError === "swahili"}');
  });

  it("renders one modal footer outside the scrolling content on mobile and desktop", () => {
    const html = renderToStaticMarkup(createElement(FullScreenSheet, {
      open: true, presentation: "sentence", title: "Neuen Satz anlegen", onClose: () => {},
      footer: createElement("div", { "data-testid": "sentence-action-footer" }, "Satz speichern | Abbrechen"),
    } as Parameters<typeof FullScreenSheet>[0], createElement("div", null, "Langer Grammatikinhalt")));
    expect(html.match(/data-testid="sentence-action-footer"/g)).toHaveLength(1);
    expect(html.indexOf("overflow-auto")).toBeLessThan(html.indexOf("data-testid=\"sentence-action-footer\""));
    expect(html).toContain("h-[100dvh]");
    expect(html).toContain("md:h-[min(90dvh,860px)]");
    expect(form).toContain("footer={");
    expect(form).toContain('data-testid={isSentence ? "sentence-action-footer" : "word-action-footer"}');
    expect(styles).not.toContain("position: sticky;\n  bottom: 0;\n  z-index: 10;\n  margin: 24px -16px -16px;");
  });
});
