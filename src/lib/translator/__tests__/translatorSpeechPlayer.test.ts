import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranslationEntry } from "@/lib/translator/types";
import { TranslatorSpeechPlayer } from "@/lib/translator/translatorSpeechPlayer";
import {
  getTranslatorSpeechFailure,
  isSpeechPlaybackBlockedError,
} from "@/lib/translator/speechClient";

const entry: TranslationEntry = {
  id: "translation-1",
  timestamp: 1_700_000_000_000,
  sourceLanguage: "de",
  targetLanguage: "sw",
  originalText: "Guten Morgen.",
  translatedText: "Habari za asubuhi.",
  sourceWasDetected: false,
};

type FakeAudio = HTMLAudioElement & {
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
};

function createHarness(playAttempts: Array<() => Promise<void>> = []) {
  const audios: FakeAudio[] = [];
  const requestSpeech = vi.fn(async () =>
    Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" })),
  );
  const createObjectUrl = vi.fn(() => "blob:translation-1");
  const revokeObjectUrl = vi.fn();
  const createAudio = vi.fn(() => {
    const playAttempt = playAttempts[audios.length];
    const audio = {
      currentTime: 5,
      onended: null,
      onerror: null,
      pause: vi.fn(),
      play: vi.fn(playAttempt ?? (async () => undefined)),
      preload: "",
    } as unknown as FakeAudio;
    audios.push(audio);
    return audio;
  });
  const player = new TranslatorSpeechPlayer({
    requestSpeech,
    createObjectUrl,
    revokeObjectUrl,
    createAudio,
  });

  return {
    audios,
    requestSpeech,
    createObjectUrl,
    revokeObjectUrl,
    createAudio,
    player,
  };
}

async function waitForAudio(audios: FakeAudio[], count: number) {
  await vi.waitFor(() => expect(audios).toHaveLength(count));
}

function finishAudio(audio: FakeAudio) {
  audio.onended?.call(audio, new Event("ended"));
}

describe("TranslatorSpeechPlayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("starts automatic playback normally when the browser permits it", async () => {
    const harness = createHarness();
    const onPlaybackStarted = vi.fn();

    const playback = harness.player.play(entry, 1, {
      autoplay: true,
      onPlaybackStarted,
    });
    await waitForAudio(harness.audios, 1);
    await vi.waitFor(() => expect(onPlaybackStarted).toHaveBeenCalledOnce());
    finishAudio(harness.audios[0]);
    await playback;

    expect(harness.requestSpeech).toHaveBeenCalledOnce();
  });

  it("keeps generated audio cached when iOS blocks autoplay and reuses it on tap", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const notAllowedError = new DOMException(
      "Playback requires a user gesture",
      "NotAllowedError",
    );
    const harness = createHarness([
      async () => Promise.reject(notAllowedError),
      async () => undefined,
    ]);

    await expect(
      harness.player.play(entry, 1, { autoplay: true }),
    ).rejects.toBe(notAllowedError);

    expect(harness.player.hasCachedAudio(entry.id, 1)).toBe(true);
    expect(harness.requestSpeech).toHaveBeenCalledOnce();
    expect(getTranslatorSpeechFailure(notAllowedError, true)).toEqual({
      kind: "autoplay-blocked",
      message: "Audio ist bereit. Tippe auf Abspielen.",
    });
    expect(infoSpy).toHaveBeenCalledWith(
      "[translator][speech playback blocked]",
      { name: "NotAllowedError", autoplay: true },
    );

    const manualPlayback = harness.player.play(entry, 1, { autoplay: false });
    await waitForAudio(harness.audios, 2);
    finishAudio(harness.audios[1]);
    await manualPlayback;

    expect(harness.requestSpeech).toHaveBeenCalledOnce();
    expect(harness.createObjectUrl).toHaveBeenCalledOnce();
  });

  it("keeps technical decode failures separate from autoplay blocking", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const decodeError = new DOMException(
      "The media could not be decoded",
      "NotSupportedError",
    );
    const harness = createHarness([
      async () => Promise.reject(decodeError),
    ]);

    await expect(
      harness.player.play(entry, 1, { autoplay: true }),
    ).rejects.toBe(decodeError);

    expect(isSpeechPlaybackBlockedError(decodeError)).toBe(false);
    expect(getTranslatorSpeechFailure(decodeError, true)).toEqual({
      kind: "playback",
      message: "Die Wiedergabe ist gerade nicht möglich.",
    });
    expect(harness.player.hasCachedAudio(entry.id, 1)).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      "[translator][speech playback error]",
      { name: "NotSupportedError", autoplay: true },
    );
  });

  it("generates audio on first replay and reuses the local cache", async () => {
    const harness = createHarness();

    const firstPlayback = harness.player.play(entry, 1);
    await waitForAudio(harness.audios, 1);
    finishAudio(harness.audios[0]);
    await firstPlayback;

    const secondPlayback = harness.player.play(entry, 1);
    await waitForAudio(harness.audios, 2);
    finishAudio(harness.audios[1]);
    await secondPlayback;

    expect(harness.requestSpeech).toHaveBeenCalledOnce();
    expect(harness.createObjectUrl).toHaveBeenCalledOnce();
    expect(harness.player.hasCachedAudio(entry.id, 1)).toBe(true);
  });

  it("caches the same entry separately for different speech speeds", async () => {
    const harness = createHarness();

    const normalPlayback = harness.player.play(entry, 1);
    await waitForAudio(harness.audios, 1);
    finishAudio(harness.audios[0]);
    await normalPlayback;

    const fasterPlayback = harness.player.play(entry, 1.15);
    await waitForAudio(harness.audios, 2);
    finishAudio(harness.audios[1]);
    await fasterPlayback;

    const fasterReplay = harness.player.play(entry, 1.15);
    await waitForAudio(harness.audios, 3);
    finishAudio(harness.audios[2]);
    await fasterReplay;

    expect(harness.requestSpeech).toHaveBeenCalledTimes(2);
    expect(harness.requestSpeech).toHaveBeenNthCalledWith(
      1,
      entry,
      1,
      expect.any(AbortSignal),
    );
    expect(harness.requestSpeech).toHaveBeenNthCalledWith(
      2,
      entry,
      1.15,
      expect.any(AbortSignal),
    );
    expect(harness.player.hasCachedAudio(entry.id, 1)).toBe(true);
    expect(harness.player.hasCachedAudio(entry.id, 1.15)).toBe(true);
  });

  it("stops the current audio before another playback starts", async () => {
    const harness = createHarness();

    const firstPlayback = harness.player.play(entry, 1);
    await waitForAudio(harness.audios, 1);
    const secondPlayback = harness.player.play(entry, 1);
    await waitForAudio(harness.audios, 2);

    expect(harness.audios[0].pause).toHaveBeenCalledOnce();
    expect(harness.audios[0].currentTime).toBe(0);
    await firstPlayback;
    finishAudio(harness.audios[1]);
    await secondPlayback;
  });

  it("pauses and resumes the same audio from its current position", async () => {
    const harness = createHarness();
    const playback = harness.player.play(entry, 1);
    await waitForAudio(harness.audios, 1);
    const audio = harness.audios[0];

    expect(harness.player.pausePlayback()).toBe(true);
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.currentTime).toBe(5);

    await harness.player.resumePlayback();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.currentTime).toBe(5);

    finishAudio(audio);
    await playback;
  });

  it("stops playback and revokes cached object URLs when history is cleared", async () => {
    const harness = createHarness();
    const playback = harness.player.play(entry, 1);
    await waitForAudio(harness.audios, 1);

    harness.player.clearCache();

    expect(harness.audios[0].pause).toHaveBeenCalledOnce();
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith("blob:translation-1");
    expect(harness.player.hasCachedAudio(entry.id, 1)).toBe(false);
    await playback;
  });

  it("stops audio and releases URLs when disposed on unmount", async () => {
    const harness = createHarness();
    const playback = harness.player.play(entry, 1);
    await waitForAudio(harness.audios, 1);

    harness.player.dispose();

    expect(harness.audios[0].pause).toHaveBeenCalledOnce();
    expect(harness.revokeObjectUrl).toHaveBeenCalledOnce();
    await playback;
    await expect(harness.player.play(entry, 1)).rejects.toThrow(
      "Speech player is disposed",
    );
  });

  it("does not start delayed audio after a pending request was stopped", async () => {
    let resolveRequest!: (blob: Blob) => void;
    const requestSpeech = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const createAudio = vi.fn();
    const player = new TranslatorSpeechPlayer({
      requestSpeech,
      createObjectUrl: vi.fn(() => "blob:late"),
      revokeObjectUrl: vi.fn(),
      createAudio,
    });

    const playback = player.play(entry, 1);
    await vi.waitFor(() => expect(requestSpeech).toHaveBeenCalledOnce());
    player.stopPlayback();
    resolveRequest(new Blob(["audio"], { type: "audio/mpeg" }));

    await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(createAudio).not.toHaveBeenCalled();
  });
});
