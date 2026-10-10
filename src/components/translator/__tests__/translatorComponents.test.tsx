import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import TranslationCard from "@/components/translator/TranslationCard";
import TranslationDirectionSelector from "@/components/translator/TranslationDirectionSelector";
import ProcessingIndicator from "@/components/translator/ProcessingIndicator";
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
    expect(html).toContain("Rückmeldung");
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
    expect(source).toContain("getTranslatorSpeechFailure(error, automatic, speechReady)");
    expect(source).toContain('ttsGenerationOutcome: state.autoPlay ? "request_started" : "disabled"');
    expect(source).toContain('ttsSkipReason: state.autoPlay ? null : "autoplay_disabled"');
    expect(source).toContain("claimAutoplay(entry.id)");
    expect(source).toContain("claimFailureEvent(attemptId)");
    expect(source).toContain("DEFAULT_SPEECH_SPEED");
    expect(source).toContain('type="range"');
    expect(source).toContain("setSpeechSpeed(Number(event.target.value))");
  });

  it("starts MediaRecorder without waiting for realtime and exposes the QA report", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorView.tsx"),
      "utf8",
    );
    const microphoneIndex = source.indexOf("const acquisition = acquireMicrophone()");
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
    expect(source).toContain("SHARED_CONVERSATION_LABELS.openingMicrophone");
    expect(source).toContain("SHARED_CONVERSATION_LABELS.recording");
    expect(source).toContain("Testreport exportieren");
    expect(source).toContain("JSON.stringify({");
    expect(source).toContain('window.addEventListener("pagehide"');
    expect(source).toContain('realtimeManagerRef.current?.close("classic_unmount")');
    expect(source).toContain("mountedRef.current = true");
    expect(source).toContain("withRecordingStartOperationWatchdog(");
    expect(source).toContain("recordingStartGenerationRef.current");
    expect(source).toContain("markLateCompletion(");
  });

  it("makes post-conversation review actionable or explicitly empty", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorView.tsx"),
      "utf8",
    );
    expect(source).toContain("postConversationReviewPendingCount");
    expect(source).toContain("Qualitätsprüfung abgeschlossen");
    expect(source).toContain("offen)");
    expect(source).toContain("postConversationReviewCandidateCount === 0");
    expect(source).toContain("keine auffälligen Passagen zum Prüfen");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("'[data-review-candidate=\"true\"]'");
    expect(source).toContain("qualityByTurn: qualityByTurnRef.current");
    expect(source).toContain("failedPostConversationReviewCandidateIds.length");
    expect(source).toContain("MAX_POST_CONVERSATION_REVIEW_CANDIDATES");
    expect(source).toContain("applySameAudioGroundTruthToSafeSttModelBenchmark");
    expect(source).toContain('status: "accepted_primary"');
    expect(source).toContain('status: "corrected"');
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
    const preparing = renderToStaticMarkup(
      <TranslationCard {...commonProps} playbackState="preparing" />,
    );
    const paused = renderToStaticMarkup(
      <TranslationCard {...commonProps} playbackState="paused" />,
    );

    expect(preparing).toContain("Audio wird vorbereitet");
    expect(preparing).toContain("Vorbereitung abbrechen");
    expect(preparing).not.toContain("Sprachausgabe stoppen");
    expect(playing).toContain("Pause");
    expect(playing).toContain("Stop");
    expect(paused).toContain("Fortsetzen");
    expect(paused).toContain("Stop");
  });

  it("shows separate preparing and active-playback actions in the main view", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorView.tsx"),
      "utf8",
    );
    const preparingUi = source.slice(
      source.indexOf('{state.status === "preparing" ? (', source.indexOf("<ProcessingIndicator key={processingPhase}")),
      source.indexOf('{state.status === "playing" ? (', source.indexOf("<ProcessingIndicator key={processingPhase}")),
    );
    const playingUi = source.slice(
      source.indexOf('{state.status === "playing" ? (', source.indexOf("<ProcessingIndicator key={processingPhase}")),
      source.indexOf('{state.status === "paused" ? (', source.indexOf("<ProcessingIndicator key={processingPhase}")),
    );

    expect(preparingUi).toContain("SHARED_CONVERSATION_LABELS.preparingAudio.de");
    expect(preparingUi).toContain("SHARED_CONVERSATION_LABELS.startRecording.de");
    expect(preparingUi).not.toContain("Sprachausgabe stoppen");
    expect(playingUi).toContain("Sprachausgabe läuft");
    expect(playingUi).toContain("Inasomwa …");
    expect(playingUi).toContain("Sprachausgabe stoppen");
    expect(playingUi).toContain("btn btn-primary min-h-20");
    expect(playingUi).toContain("btn btn-secondary min-h-12");
    expect(playingUi).toContain("SHARED_CONVERSATION_LABELS.startRecording.de");
    expect(source).toContain('dispatch({ type: "PLAYBACK_STARTED" })');
    expect(source).toContain('ttsGenerationOutcome: playbackStarted ? (speechReady ? "success" : "aborted") : isCurrentRun ? "aborted" : "stale_result"');
    expect(source).toContain('ttsSkipReason: playbackStarted ? null : isCurrentRun ? "playback_aborted" : "stale_playback_result"');
    expect(source).toContain('ttsPlaybackOutcome: "interrupted"');
    expect(source).toContain('ttsPlaybackOutcome: "completed"');
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

    expect(html).toContain("Rückmeldung erfasst");
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
        reviewOrigin="qa_simulation"
        onAcceptTranscript={vi.fn()} onSaveTranscriptCorrection={vi.fn()}
      />,
    );
    expect(html).toContain("Hat die App das richtig verstanden?");
    expect(html).toContain("Nein, korrigieren");
    expect(html).toContain("keine organische Lern-Evidenz");
    expect(html).toContain("Dieses Haus ist groß.");
  });

  it("keeps benchmark and explicit failure simulations internal", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorView.tsx"),
      "utf8",
    );
    expect(source).toContain("INTERNAL_TRANSLATOR_QA_ENABLED");
    expect(source).toContain("Sprach-Qualitätsmodus (interner Test)");
    expect(source).toContain("dieselbe Aufnahme zusätzlich über die sichere Erkennung verglichen");
    expect(source).toContain("Translation 503");
    expect(source).toContain("TTS 503");
    expect(source).toContain('realtime: "Realtime-Ausfall"');
    expect(source).toContain('semantic: "Semantic-Rescue"');
    expect(source).toContain('network: "Netzwerkabbruch"');
    expect(source).toContain("Nur interner Test. Der gewählte Fehler wird genau bei der nächsten Aufnahme simuliert.");
    expect(source).toContain("Nächster Test:");
    expect(source).toContain("Abbrechen");
  });

  it("does not attach a warning or retry notice to a successful fallback turn", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorView.tsx"),
      "utf8",
    );
    const successDispatch = source.slice(
      source.indexOf('type: "PROCESSING_SUCCEEDED"'),
      source.indexOf("if (usedAudioFallback)", source.indexOf('type: "PROCESSING_SUCCEEDED"')),
    );
    expect(successDispatch).not.toContain("notice:");
    expect(source).toContain('state.status === "error"');
    expect(source).toContain("SHARED_CONVERSATION_LABELS.retry.de");
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

  it("renders a moving bilingual processing status with reduced-motion support", () => {
    const html = renderToStaticMarkup(<ProcessingIndicator stage="translation" />);
    expect(html).toContain("motion-safe:animate-spin");
    expect(html).toContain("motion-reduce:opacity-100");
    expect(html).toContain("Übersetzung wird erstellt");
    expect(html).toContain("Inatafsiri");
    expect(html).toContain('role="status"');
  });

  it("shows essence separately and leaves the complete translation primary", () => {
    const fullTranslation = "Vollständiger Inhalt ".repeat(45);
    const html = renderToStaticMarkup(
      <TranslationCard
        entry={{
          id: "summary",
          timestamp: 1_700_000_000_000,
          sourceLanguage: "sw",
          targetLanguage: "de",
          originalText: "Maelezo marefu.",
          translatedText: fullTranslation,
          essenceSummary: "Die Kernaussage bleibt kurz.",
          sourceWasDetected: true,
        }}
        isLatest
        playbackState="idle"
        playbackDisabled={false}
        feedbackDisabled={false}
        feedbackSaved={false}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(html).toContain("Kurz gesagt · Kwa kifupi");
    expect(html).toContain("Die Kernaussage bleibt kurz.");
    expect(html).toContain("Vollständige Übersetzung anzeigen");
  });
});
