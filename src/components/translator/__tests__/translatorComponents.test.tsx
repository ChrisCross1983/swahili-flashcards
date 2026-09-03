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
        feedbackDisabled={false}
        feedbackSaved={false}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );

    expect(html).toContain("Deutsch erkannt → Kiswahili");
    expect(html).toContain("Gesprochen · Deutsch");
    expect(html).toContain("Wo ist der nächste Bus?");
    expect(html).toContain("Basi inayofuata iko wapi?");
    expect(html).toContain("Abspielen");
    expect(html).toContain("Feedback");
  });

  it("only starts automatic speech when the visible toggle is enabled", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorView.tsx"),
      "utf8",
    );

    expect(source).toContain("if (state.autoPlay) void handlePlayback(entry, true)");
    expect(source).toContain("aria-checked={state.autoPlay}");
    expect(source).toContain('state.autoPlay ? "AN" : "AUS"');
    expect(source).toContain("await playTranslation(");
    expect(source).toContain("speechSpeed,\n        automatic,");
    expect(source).toContain("getTranslatorSpeechFailure(error, automatic)");
    expect(source).toContain("DEFAULT_SPEECH_SPEED");
    expect(source).toContain('type="range"');
    expect(source).toContain("setSpeechSpeed(Number(event.target.value))");
  });

  it("starts MediaRecorder without waiting for realtime and exposes the QA report", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorView.tsx"),
      "utf8",
    );
    const microphoneIndex = source.indexOf("await acquireMicrophone()");
    const prepareIndex = source.indexOf("await prepareRecording()");
    const recorderStartIndex = source.indexOf(
      "await startPreparedRecording()",
    );
    const backgroundWarmIndex = source.indexOf(
      "await getRealtimeManager().recordingStarted(",
    );

    expect(microphoneIndex).toBeGreaterThan(-1);
    expect(prepareIndex).toBeGreaterThan(-1);
    expect(recorderStartIndex).toBeGreaterThan(prepareIndex);
    expect(backgroundWarmIndex).toBeGreaterThan(recorderStartIndex);
    expect(source).not.toContain("waitUntilReady");
    expect(source).toContain("Mikrofon wird geöffnet …");
    expect(source).toContain("Aufnahme läuft …");
    expect(source).toContain("Testreport exportieren");
    expect(source).toContain("JSON.stringify({");
    expect(source).toContain('window.addEventListener("pagehide"');
    expect(source).toContain('realtimeManagerRef.current?.close("classic_unmount")');
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
      feedbackDisabled: false,
      feedbackSaved: false,
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onFeedback: vi.fn(),
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

  it("shows a saved state on the exact translation card", () => {
    const entry: TranslationEntry = {
      id: "translation-feedback",
      timestamp: 1_700_000_000_000,
      sourceLanguage: "de",
      targetLanguage: "sw",
      originalText: "Danke.",
      translatedText: "Asante.",
      sourceWasDetected: false,
    };
    const html = renderToStaticMarkup(
      <TranslationCard
        entry={entry}
        isLatest={false}
        playbackState="idle"
        playbackDisabled={false}
        feedbackDisabled={false}
        feedbackSaved
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );

    expect(html).toContain("Feedback gespeichert");
  });

  it("renders the internal one-click STT review without changing the translation card", () => {
    const entry: TranslationEntry = {
      id: "speech-review", timestamp: 1_700_000_000_000,
      sourceLanguage: "sw", targetLanguage: "de",
      originalText: "Nyumba hii ni kubwa.", translatedText: "Dieses Haus ist groß.",
      sourceWasDetected: true,
    };
    const html = renderToStaticMarkup(
      <TranslationCard
        entry={entry} isLatest playbackState="idle" playbackDisabled={false}
        feedbackDisabled={false} feedbackSaved={false}
        onPlay={vi.fn()} onPause={vi.fn()} onResume={vi.fn()} onStop={vi.fn()}
        onFeedback={vi.fn()} recognitionReviewStatus="unreviewed"
        onAcceptTranscript={vi.fn()} onSaveTranscriptCorrection={vi.fn()}
      />,
    );
    expect(html).toContain("Richtig erkannt");
    expect(html).toContain("Transkript korrigieren");
    expect(html).toContain("Dieses Haus ist groß.");
  });

  it("keeps QA controls internal and states that no second STT call is started", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorView.tsx"),
      "utf8",
    );
    expect(source).toContain("INTERNAL_TRANSLATOR_QA_ENABLED");
    expect(source).toContain("Sprach-Qualitätsmodus (interner Test)");
    expect(source).toContain("Es wird keine zusätzliche Spracherkennung gestartet.");
    expect(source).toContain("Translation 503");
    expect(source).toContain("TTS 503");
  });

  it("keeps diagnostics collapsed after the conversation in the mobile flow", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorView.tsx"),
      "utf8",
    );
    expect(source).toContain("<details");
    expect(source).toContain("⚙ Erweiterte Einstellungen");
    expect(source.indexOf('className="order-1 mt-7"'))
      .toBeGreaterThan(source.indexOf("<details"));
    expect(source).toContain("Letzte Diagnose exportieren");
  });
});
