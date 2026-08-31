import { describe, expect, it } from "vitest";
import { TranslatorTurnPerformance } from "@/lib/translator/turnPerformance";
import {
  initialTranslatorState,
  translatorReducer,
} from "@/lib/translator/stateMachine";
import type { TranslationEntry } from "@/lib/translator/types";

function createEntry(id: string): TranslationEntry {
  return {
    id,
    timestamp: 1,
    sourceLanguage: "de",
    targetLanguage: "sw",
    originalText: "Hallo",
    translatedText: "Habari",
    sourceWasDetected: false,
    diagnostics: {
      transcriptionModel: "gpt-4o-mini-transcribe",
      translationModel: "gpt-5.6-terra",
      transcriptionMs: 400,
      translationMs: 200,
      serverTranslationTotalMs: 610,
      transcriptionFallbackUsed: false,
      detectedLanguage: "de",
    },
  };
}

describe("translator turn performance", () => {
  it("derives one turn's client durations from a single performance clock", () => {
    const turn = new TranslatorTurnPerformance({ recordButtonClicked: 0 });

    turn.markGetUserMediaStarted(1);
    turn.markGetUserMediaReady(10);
    turn.markMediaRecorderPrepared(20);
    turn.markRealtimeSetupStarted(10);
    turn.markRealtimeConnectionReady(40);
    turn.markTranscriptionPathDecision({
      transcriptionPathDecisionAt: "2026-08-31T06:00:00.000Z",
      transcriptionPathDecisionReason: "warm_realtime_ready",
      connectionId: "connection-1",
      realtimeConnectionReadyAtRecordingStart: "2026-08-31T05:59:55.000Z",
      realtimeConnectionReused: true,
      realtimeConnectionAgeAtRecordingStartMs: 5_000,
      warmStart: true,
    }, 45);
    turn.markRecordingStarted(50);
    turn.markFirstTranscriptDelta(80);
    turn.markRecordingStopped(100);
    turn.markTranscriptFinal(115);
    turn.setTranscriptionOutcome("realtime");
    turn.markTranslationRequestStarted(120);
    turn.markTranslationCompleted(700);
    turn.markTranslationVisible(720);
    turn.markTtsRequestStarted(730);
    turn.markTtsReady(1_030);
    turn.markPlaybackStarted(1_050);
    turn.markPlaybackCompleted(2_000);

    expect(turn.getDiagnostics()).toMatchObject({
      realtimeSetupMs: 30,
      recordClickToMicReadyMs: 10,
      recordClickToRecordingStartedMs: 50,
      getUserMediaToRecordingStartedMs: 49,
      recordingDurationMs: 50,
      stopToTranscriptFinalMs: 15,
      translationRequestMs: 580,
      transcriptFinalToTranslationReadyMs: 585,
      stopToTranslationVisibleMs: 620,
      ttsRequestToReadyMs: 300,
      translationReadyToTtsReadyMs: 330,
      translationVisibleToTtsReadyMs: 310,
      stopToTtsReadyMs: 930,
      stopToPlaybackStartedMs: 950,
      ttsReadyToPlaybackStartedMs: 20,
      interactionOverheadMs: 1_000,
      transcriptionPath: "realtime",
      transcriptionPathDecisionReason: "warm_realtime_ready",
      connectionId: "connection-1",
      realtimeConnectionReused: true,
    });
    expect(turn.getDiagnostics()).toMatchObject({
      realtimeSetupStartedAt: expect.any(String),
      realtimeConnectionReadyAt: expect.any(String),
      recordingStartedAt: expect.any(String),
      recordButtonClickedAt: expect.any(String),
      getUserMediaStartedAt: expect.any(String),
      getUserMediaReadyAt: expect.any(String),
      mediaRecorderPreparedAt: expect.any(String),
      recordingStoppedAt: expect.any(String),
      firstTranscriptDeltaAt: expect.any(String),
      transcriptFinalAt: expect.any(String),
      translationStartedAt: expect.any(String),
      translationReadyAt: expect.any(String),
      ttsStartedAt: expect.any(String),
      ttsReadyAt: expect.any(String),
      playbackStartedAt: expect.any(String),
      playbackCompletedAt: expect.any(String),
    });
  });

  it("never emits negative or non-finite durations", () => {
    const turn = new TranslatorTurnPerformance(500);

    turn.markTranslationRequestStarted(Number.NaN);
    turn.markTranslationCompleted(450);
    turn.markTranslationVisible(490);
    turn.markTtsRequestStarted(700);
    turn.markTtsReady(450);
    turn.markPlaybackStarted(Number.POSITIVE_INFINITY);

    expect(turn.getDiagnostics()).not.toHaveProperty("translationRequestMs");
    expect(turn.getDiagnostics()).not.toHaveProperty(
      "stopToTranslationVisibleMs",
    );
    expect(turn.getDiagnostics()).not.toHaveProperty("ttsRequestToReadyMs");
    expect(turn.getDiagnostics()).not.toHaveProperty(
      "stopToPlaybackStartedMs",
    );
  });

  it("keeps new turns and TTS diagnostics bound to their own cards", () => {
    const first = new TranslatorTurnPerformance(100);
    first.markTranslationVisible(500);
    first.markTtsRequestStarted(510);
    first.markTtsReady(800);

    const second = new TranslatorTurnPerformance(1_000);
    second.markTranslationVisible(1_300);

    const firstEntry = createEntry("first");
    const secondEntry = createEntry("second");
    const withEntries = {
      ...initialTranslatorState,
      entries: [secondEntry, firstEntry],
    };
    const updated = translatorReducer(withEntries, {
      type: "UPDATE_ENTRY_DIAGNOSTICS",
      entryId: firstEntry.id,
      diagnostics: first.getDiagnostics(),
    });

    expect(updated.entries[0].diagnostics).not.toHaveProperty(
      "stopToTtsReadyMs",
    );
    expect(updated.entries[1].diagnostics).toMatchObject({
      stopToTranslationVisibleMs: 400,
      ttsRequestToReadyMs: 290,
      stopToTtsReadyMs: 700,
    });
    expect(second.getDiagnostics()).toMatchObject({
      stopToTranslationVisibleMs: 300,
    });
  });
});
