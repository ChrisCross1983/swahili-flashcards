import { describe, expect, it } from "vitest";
import {
  createMockTranslationEntry,
  initialTranslatorState,
  TRANSLATION_DIRECTIONS,
  translatorReducer,
} from "@/lib/translator/stateMachine";

describe("translator state machine", () => {
  it("changes translation direction only while idle", () => {
    const changed = translatorReducer(initialTranslatorState, {
      type: "SET_DIRECTION",
      direction: TRANSLATION_DIRECTIONS.deToSw,
    });

    expect(changed.direction).toEqual(TRANSLATION_DIRECTIONS.deToSw);

    const recording = translatorReducer(changed, { type: "START_RECORDING" });
    const ignored = translatorReducer(recording, {
      type: "SET_DIRECTION",
      direction: TRANSLATION_DIRECTIONS.swToDe,
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

  it("stores a successful mock result as a TranslationEntry", () => {
    const entry = createMockTranslationEntry(
      TRANSLATION_DIRECTIONS.swToDe,
      1_700_000_000_000,
      "translation-1",
    );
    const recording = translatorReducer(initialTranslatorState, {
      type: "START_RECORDING",
    });
    const processing = translatorReducer(recording, {
      type: "STOP_AND_TRANSLATE",
    });
    const complete = translatorReducer(processing, {
      type: "PROCESSING_SUCCEEDED",
      entry,
    });

    expect(complete.status).toBe("idle");
    expect(complete.entries).toEqual([entry]);
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

  it("enters playing after processing when auto play is enabled", () => {
    const autoPlay = translatorReducer(initialTranslatorState, {
      type: "TOGGLE_AUTO_PLAY",
    });
    const recording = translatorReducer(autoPlay, { type: "START_RECORDING" });
    const processing = translatorReducer(recording, { type: "STOP_AND_TRANSLATE" });
    const entry = createMockTranslationEntry(
      TRANSLATION_DIRECTIONS.swToDe,
      1_700_000_000_000,
      "translation-1",
    );
    const playing = translatorReducer(processing, {
      type: "PROCESSING_SUCCEEDED",
      entry,
    });

    expect(playing.status).toBe("playing");
    expect(translatorReducer(playing, { type: "START_RECORDING" })).toBe(playing);
    expect(translatorReducer(playing, { type: "PLAYBACK_FINISHED" }).status).toBe("idle");
  });

  it("clears the local conversation while idle", () => {
    const entry = createMockTranslationEntry(
      TRANSLATION_DIRECTIONS.deToSw,
      1_700_000_000_000,
      "translation-1",
    );
    const withEntry = { ...initialTranslatorState, entries: [entry] };

    expect(
      translatorReducer(withEntry, { type: "CLEAR_HISTORY" }).entries,
    ).toEqual([]);
  });
});
