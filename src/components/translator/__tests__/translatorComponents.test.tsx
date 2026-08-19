import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import TranslationCard from "@/components/translator/TranslationCard";
import TranslationDirectionSelector from "@/components/translator/TranslationDirectionSelector";
import { TRANSLATION_MODES } from "@/lib/translator/stateMachine";
import type { TranslationEntry } from "@/lib/translator/types";

describe("translator components", () => {
  it("marks the selected translation direction", () => {
    const html = renderToStaticMarkup(
      <TranslationDirectionSelector
        mode={TRANSLATION_MODES.auto}
        disabled={false}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("AUTO · Automatische Spracherkennung");
    expect(html).toContain("Kiswahili → Deutsch");
    expect(html).toContain("Deutsch → Kiswahili");
    expect(html).toContain('<option value="auto" selected="">');
  });

  it("renders original and translated mock text separately", () => {
    const entry: TranslationEntry = {
      id: "translation-1",
      timestamp: 1_700_000_000_000,
      sourceLanguage: "de",
      targetLanguage: "sw",
      originalText: "Wo ist der nächste Bus?",
      translatedText: "Basi inayofuata iko wapi?",
      sourceWasDetected: true,
    };
    const html = renderToStaticMarkup(
      <TranslationCard
        entry={entry}
        isLatest
        playbackState="idle"
        playbackDisabled
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(html).toContain("Deutsch erkannt → Kiswahili");
    expect(html).toContain("Gesprochen · Deutsch");
    expect(html).toContain("Wo ist der nächste Bus?");
    expect(html).toContain("Basi inayofuata iko wapi?");
    expect(html).toContain("Abspielen");
  });

  it("only starts automatic speech when the visible toggle is enabled", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorView.tsx"),
      "utf8",
    );

    expect(source).toContain("if (state.autoPlay) void handlePlayback(entry, true)");
    expect(source).toContain("aria-checked={state.autoPlay}");
    expect(source).toContain('state.autoPlay ? "AN" : "AUS"');
    expect(source).toContain("playTranslation(entry, speechSpeed");
    expect(source).toContain("DEFAULT_SPEECH_SPEED");
    expect(source).toContain('type="range"');
    expect(source).toContain("setSpeechSpeed(Number(event.target.value))");
  });

  it("shows entry-bound pause, resume and stop controls", () => {
    const entry: TranslationEntry = {
      id: "translation-2",
      timestamp: 1_700_000_000_000,
      sourceLanguage: "sw",
      targetLanguage: "de",
      originalText: "Habari.",
      translatedText: "Guten Tag.",
      sourceWasDetected: true,
    };
    const commonProps = {
      entry,
      isLatest: true,
      playbackDisabled: false,
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
    };

    const playing = renderToStaticMarkup(
      <TranslationCard {...commonProps} playbackState="playing" />,
    );
    const paused = renderToStaticMarkup(
      <TranslationCard {...commonProps} playbackState="paused" />,
    );

    expect(playing).toContain("Pause");
    expect(playing).toContain("Stop");
    expect(paused).toContain("Fortsetzen");
    expect(paused).toContain("Stop");
  });
});
