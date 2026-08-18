import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TranslationCard from "@/components/translator/TranslationCard";
import TranslationDirectionSelector from "@/components/translator/TranslationDirectionSelector";
import { TRANSLATION_DIRECTIONS } from "@/lib/translator/stateMachine";
import type { TranslationEntry } from "@/lib/translator/types";

describe("translator components", () => {
  it("marks the selected translation direction", () => {
    const html = renderToStaticMarkup(
      <TranslationDirectionSelector
        direction={TRANSLATION_DIRECTIONS.deToSw}
        disabled={false}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("Kiswahili → Deutsch");
    expect(html).toContain("Deutsch → Kiswahili");
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders original and translated mock text separately", () => {
    const entry: TranslationEntry = {
      id: "translation-1",
      timestamp: 1_700_000_000_000,
      sourceLanguage: "de",
      targetLanguage: "sw",
      originalText: "Wo ist der nächste Bus?",
      translatedText: "Basi inayofuata iko wapi?",
    };
    const html = renderToStaticMarkup(
      <TranslationCard
        entry={entry}
        isLatest
        playbackDisabled
        onPlay={vi.fn()}
      />,
    );

    expect(html).toContain("Original · Deutsch");
    expect(html).toContain("Wo ist der nächste Bus?");
    expect(html).toContain("Basi inayofuata iko wapi?");
    expect(html).toContain("Noch einmal abspielen");
  });
});
