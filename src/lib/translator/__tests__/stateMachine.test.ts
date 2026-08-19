import { describe, expect, it } from "vitest";
import {
  initialTranslatorState,
  TRANSLATION_MODES,
  translatorReducer,
} from "@/lib/translator/stateMachine";
import type { TranslationEntry } from "@/lib/translator/types";

const swToDeEntry: TranslationEntry = {
  id: "translation-1",
  timestamp: 1_700_000_000_000,
  sourceLanguage: "sw",
  targetLanguage: "de",
  originalText: "Tutakuja kesho asubuhi.",
  translatedText: "Wir kommen morgen früh.",
  sourceWasDetected: true,
};

describe("translator state machine", () => {
  it("uses AUTO by default and changes mode only while idle", () => {
    expect(initialTranslatorState.mode).toBe(TRANSLATION_MODES.auto);
    const changed = translatorReducer(initialTranslatorState, {
      type: "SET_MODE",
      mode: TRANSLATION_MODES.deToSw,
    });

    expect(changed.mode).toBe(TRANSLATION_MODES.deToSw);

    const recording = translatorReducer(changed, { type: "START_RECORDING" });
    const ignored = translatorReducer(recording, {
      type: "SET_MODE",
      mode: TRANSLATION_MODES.swToDe,
    });
    expect(ignored).toBe(recording);
  });

  it("moves from idle to recording and then processing", () => {
    const recording = translatorReducer(initialTranslatorState, {
      type: "START_RECORDING",
    });
    const processing = translatorReducer(recording, {
      type: "STOP_AND_TRANSLATE",
    });

    expect(recording.status).toBe("recording");
    expect(processing.status).toBe("processing");
  });

  it("moves a microphone failure to error without entering processing", () => {
    const failed = translatorReducer(initialTranslatorState, {
      type: "RECORDING_FAILED",
      message: "Mikrofonzugriff wurde nicht erlaubt.",
    });

    expect(failed).toMatchObject({
      status: "error",
      errorMessage: "Mikrofonzugriff wurde nicht erlaubt.",
    });
    expect(
      translatorReducer(failed, { type: "STOP_AND_TRANSLATE" }),
    ).toBe(failed);
  });

  it("stores a successful API result as a TranslationEntry", () => {
    const recording = translatorReducer(initialTranslatorState, {
      type: "START_RECORDING",
    });
    const processing = translatorReducer(recording, {
      type: "STOP_AND_TRANSLATE",
    });
    const complete = translatorReducer(processing, {
      type: "PROCESSING_SUCCEEDED",
      entry: swToDeEntry,
    });

    expect(complete.status).toBe("idle");
    expect(complete.entries).toEqual([swToDeEntry]);
    expect(complete.entries[0]).toMatchObject({
      sourceLanguage: "sw",
      targetLanguage: "de",
      originalText: "Tutakuja kesho asubuhi.",
      translatedText: "Wir kommen morgen früh.",
    });
  });

  it("ignores a second recording request while processing", () => {
    const recording = translatorReducer(initialTranslatorState, {
      type: "START_RECORDING",
    });
    const processing = translatorReducer(recording, {
      type: "STOP_AND_TRANSLATE",
    });

    expect(translatorReducer(processing, { type: "START_RECORDING" })).toBe(processing);
  });

  it("returns from a processing error to idle", () => {
    const recording = translatorReducer(initialTranslatorState, {
      type: "START_RECORDING",
    });
    const processing = translatorReducer(recording, {
      type: "STOP_AND_TRANSLATE",
    });
    const failed = translatorReducer(processing, {
      type: "PROCESSING_FAILED",
      message: "Mock-Fehler",
    });

    expect(failed).toMatchObject({
      status: "error",
      errorMessage: "Mock-Fehler",
    });
    expect(translatorReducer(failed, { type: "RESET_ERROR" })).toMatchObject({
      status: "idle",
      errorMessage: null,
    });
  });

  it("keeps auto play off by default and returns to idle with visible text", () => {
    const recording = translatorReducer(initialTranslatorState, {
      type: "START_RECORDING",
    });
    const processing = translatorReducer(recording, {
      type: "STOP_AND_TRANSLATE",
    });
    const complete = translatorReducer(processing, {
      type: "PROCESSING_SUCCEEDED",
      entry: swToDeEntry,
    });

    expect(initialTranslatorState.autoPlay).toBe(false);
    expect(complete.status).toBe("idle");
    expect(complete.entries).toEqual([swToDeEntry]);
  });

  it("stores visible text and enters playing when auto play is enabled", () => {
    const autoPlay = translatorReducer(initialTranslatorState, {
      type: "TOGGLE_AUTO_PLAY",
    });
    const recording = translatorReducer(autoPlay, { type: "START_RECORDING" });
    const processing = translatorReducer(recording, { type: "STOP_AND_TRANSLATE" });
    const complete = translatorReducer(processing, {
      type: "PROCESSING_SUCCEEDED",
      entry: swToDeEntry,
    });

    expect(complete.status).toBe("playing");
    expect(complete.activePlaybackEntryId).toBe(swToDeEntry.id);
    expect(complete.autoPlay).toBe(true);
    expect(complete.entries).toEqual([swToDeEntry]);
    expect(translatorReducer(complete, { type: "START_RECORDING" })).toBe(
      complete,
    );
    expect(
      translatorReducer(complete, { type: "PLAYBACK_FINISHED" }).status,
    ).toBe("idle");
  });

  it("pauses and resumes only the active playback entry", () => {
    const withEntry = { ...initialTranslatorState, entries: [swToDeEntry] };
    const playing = translatorReducer(withEntry, {
      type: "START_PLAYBACK",
      entryId: swToDeEntry.id,
    });
    const paused = translatorReducer(playing, { type: "PAUSE_PLAYBACK" });
    const resumed = translatorReducer(paused, { type: "RESUME_PLAYBACK" });
    const stopped = translatorReducer(resumed, { type: "PLAYBACK_FINISHED" });

    expect(playing).toMatchObject({
      status: "playing",
      activePlaybackEntryId: swToDeEntry.id,
    });
    expect(paused.status).toBe("paused");
    expect(resumed.status).toBe("playing");
    expect(stopped).toMatchObject({
      status: "idle",
      activePlaybackEntryId: null,
    });
  });

  it("clears the local conversation while idle", () => {
    const withEntry = { ...initialTranslatorState, entries: [swToDeEntry] };

    expect(
      translatorReducer(withEntry, { type: "CLEAR_HISTORY" }).entries,
    ).toEqual([]);
  });
});
