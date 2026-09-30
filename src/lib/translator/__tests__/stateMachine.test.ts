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

  it("returns a recoverable microphone failure to idle without entering processing", () => {
    const failed = translatorReducer(initialTranslatorState, {
      type: "RECORDING_FAILED",
      message: "Mikrofonzugriff wurde nicht erlaubt.",
    });

    expect(failed).toMatchObject({
      status: "idle",
      errorMessage: "Mikrofonzugriff wurde nicht erlaubt.",
    });
    expect(
      translatorReducer(failed, { type: "STOP_AND_TRANSLATE" }),
    ).toBe(failed);
    expect(translatorReducer(failed, { type: "START_RECORDING" })).toMatchObject({
      status: "recording",
      errorMessage: null,
    });
  });

  it("keeps a non-recoverable auth failure blocked", () => {
    const failed = translatorReducer(initialTranslatorState, {
      type: "RECORDING_FAILED",
      message: "Sitzung abgelaufen",
      category: "AUTH",
      healthStatus: "auth_required",
      authRequired: true,
    });
    expect(failed).toMatchObject({
      status: "error",
      failureCategory: "AUTH",
      healthStatus: "auth_required",
    });
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
      status: "idle",
      errorMessage: "Mock-Fehler",
    });
    expect(translatorReducer(failed, { type: "START_RECORDING" })).toMatchObject({
      status: "recording",
      errorMessage: null,
    });
  });

  it("supports SUCCESS to FAILURE to SUCCESS without a refresh", () => {
    const first = translatorReducer(
      translatorReducer(
        translatorReducer(initialTranslatorState, { type: "START_RECORDING" }),
        { type: "STOP_AND_TRANSLATE" },
      ),
      { type: "PROCESSING_SUCCEEDED", entry: swToDeEntry },
    );
    const failed = translatorReducer(
      translatorReducer(
        translatorReducer(first, { type: "START_RECORDING" }),
        { type: "STOP_AND_TRANSLATE" },
      ),
      { type: "PROCESSING_FAILED", message: "Temporärer Fehler", category: "NETWORK" },
    );
    const secondEntry = { ...swToDeEntry, id: "second" };
    const recovered = translatorReducer(
      translatorReducer(
        translatorReducer(failed, { type: "START_RECORDING" }),
        { type: "STOP_AND_TRANSLATE" },
      ),
      { type: "PROCESSING_SUCCEEDED", entry: secondEntry },
    );
    expect(failed.status).toBe("idle");
    expect(recovered).toMatchObject({
      status: "idle",
      errorMessage: null,
      healthStatus: "healthy",
    });
    expect(recovered.entries.map((entry) => entry.id)).toEqual(["second", swToDeEntry.id]);
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

  it("stores visible text and prepares autoplay before entering playing", () => {
    const autoPlay = translatorReducer(initialTranslatorState, {
      type: "TOGGLE_AUTO_PLAY",
    });
    const recording = translatorReducer(autoPlay, { type: "START_RECORDING" });
    const processing = translatorReducer(recording, { type: "STOP_AND_TRANSLATE" });
    const complete = translatorReducer(processing, {
      type: "PROCESSING_SUCCEEDED",
      entry: swToDeEntry,
    });

    expect(complete.status).toBe("preparing");
    expect(complete.activePlaybackEntryId).toBe(swToDeEntry.id);
    expect(complete.autoPlay).toBe(true);
    expect(complete.entries).toEqual([swToDeEntry]);
    expect(translatorReducer(complete, { type: "START_RECORDING" })).toBe(
      complete,
    );
    const playing = translatorReducer(complete, { type: "PLAYBACK_STARTED" });
    expect(playing.status).toBe("playing");
    expect(
      translatorReducer(playing, { type: "PLAYBACK_FINISHED" }).status,
    ).toBe("idle");
  });

  it("allows preparing playback to be stopped or replaced by a new recording", () => {
    const withEntry = { ...initialTranslatorState, entries: [swToDeEntry] };
    const preparing = translatorReducer(withEntry, {
      type: "START_PLAYBACK",
      entryId: swToDeEntry.id,
    });

    expect(preparing.status).toBe("preparing");
    expect(translatorReducer(preparing, { type: "PLAYBACK_FINISHED" })).toMatchObject({
      status: "idle",
      activePlaybackEntryId: null,
    });

    const recordingAfterCancel = translatorReducer(
      translatorReducer(preparing, { type: "PLAYBACK_FINISHED" }),
      { type: "START_RECORDING" },
    );
    expect(recordingAfterCancel.status).toBe("recording");

    const playing = translatorReducer(preparing, { type: "PLAYBACK_STARTED" });
    const recordingAfterPlayback = translatorReducer(
      translatorReducer(playing, { type: "PLAYBACK_FINISHED" }),
      { type: "START_RECORDING" },
    );
    expect(recordingAfterPlayback.status).toBe("recording");
  });

  it("ignores playback-start events unless audio is preparing", () => {
    expect(translatorReducer(initialTranslatorState, { type: "PLAYBACK_STARTED" }))
      .toBe(initialTranslatorState);
    const processing = translatorReducer(
      translatorReducer(initialTranslatorState, { type: "START_RECORDING" }),
      { type: "STOP_AND_TRANSLATE" },
    );
    expect(translatorReducer(processing, { type: "PLAYBACK_STARTED" })).toBe(processing);
  });

  it("pauses and resumes only the active playback entry", () => {
    const withEntry = { ...initialTranslatorState, entries: [swToDeEntry] };
    const preparing = translatorReducer(withEntry, {
      type: "START_PLAYBACK",
      entryId: swToDeEntry.id,
    });
    const playing = translatorReducer(preparing, { type: "PLAYBACK_STARTED" });
    const paused = translatorReducer(playing, { type: "PAUSE_PLAYBACK" });
    const resumed = translatorReducer(paused, { type: "PLAYBACK_STARTED" });
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

  it("adds TTS diagnostics to the matching translation entry", () => {
    const withEntry = { ...initialTranslatorState, entries: [swToDeEntry] };
    const updated = translatorReducer(withEntry, {
      type: "UPDATE_ENTRY_DIAGNOSTICS",
      entryId: swToDeEntry.id,
      diagnostics: {
        ttsModel: "gpt-4o-mini-tts",
        ttsGenerationMs: 420,
        ttsSpeed: 1.1,
        autoplayEnabled: true,
        autoplayBlocked: false,
      },
    });

    expect(updated.entries[0].diagnostics).toMatchObject({
      ttsModel: "gpt-4o-mini-tts",
      ttsGenerationMs: 420,
      ttsSpeed: 1.1,
      autoplayEnabled: true,
      autoplayBlocked: false,
    });
  });

  it("clears the local conversation while idle", () => {
    const withEntry = { ...initialTranslatorState, entries: [swToDeEntry] };

    expect(
      translatorReducer(withEntry, { type: "CLEAR_HISTORY" }).entries,
    ).toEqual([]);
  });
});
