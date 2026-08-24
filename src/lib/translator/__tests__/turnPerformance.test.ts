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
    const turn = new TranslatorTurnPerformance(100);

    turn.markTranslationRequestStarted(120);
    turn.markTranslationCompleted(700);
    turn.markTranslationVisible(720);
    turn.markTtsRequestStarted(730);
    turn.markTtsReady(1_030);
    turn.markPlaybackStarted(1_050);

    expect(turn.getDiagnostics()).toEqual({
      translationRequestMs: 580,
      stopToTranslationVisibleMs: 620,
      ttsRequestToReadyMs: 300,
      translationVisibleToTtsReadyMs: 310,
      stopToTtsReadyMs: 930,
      stopToPlaybackStartedMs: 950,
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

    expect(turn.getDiagnostics()).toEqual({});
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
    expect(second.getDiagnostics()).toEqual({
      stopToTranslationVisibleMs: 300,
    });
  });
});
