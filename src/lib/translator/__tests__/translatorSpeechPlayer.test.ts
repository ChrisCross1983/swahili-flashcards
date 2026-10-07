import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranslationEntry } from "@/lib/translator/types";
import {
  TranslatorSpeechPlayer,
  NATIVE_PROGRESSIVE_PLAYBACK_START_TIMEOUT_MS,
  type TranslatorSpeechPlayerDependencies,
} from "@/lib/translator/translatorSpeechPlayer";
import {
  getTranslatorSpeechFailure,
  isSpeechPlaybackBlockedError,
  type TranslatorSpeechAsset,
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
  load: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
};

function createHarness(
  playAttempts: Array<() => Promise<void>> = [],
  documentVisible = true,
  requestSpeechOverride?: TranslatorSpeechPlayerDependencies["requestSpeech"],
) {
  const audios: FakeAudio[] = [];
  let playAttemptIndex = 0;
  const defaultRequestSpeech: TranslatorSpeechPlayerDependencies["requestSpeech"] =
    async () => ({
      audio: new Blob(["audio"], { type: "audio/mpeg" }),
      diagnostics: {
        ttsModel: "gpt-4o-mini-tts",
        ttsGenerationMs: 400,
      },
      serverDiagnostics: Promise.resolve({ ttsOpenAiTotalMs: 350 }),
    });
  const requestSpeech = vi.fn(requestSpeechOverride ?? defaultRequestSpeech);
  const createObjectUrl = vi.fn(() => "blob:translation-1");
  const revokeObjectUrl = vi.fn();
  const createAudio = vi.fn((url?: string) => {
    const audio = {
      currentTime: 5,
      load: vi.fn(),
      onended: null,
      onerror: null,
      pause: vi.fn(),
      play: vi.fn(() => {
        const playAttempt = playAttempts[playAttemptIndex++];
        return playAttempt?.() ?? Promise.resolve();
      }),
      preload: "",
      src: url ?? "",
    } as unknown as FakeAudio;
    audios.push(audio);
    return audio;
  });
  const player = new TranslatorSpeechPlayer({
    requestSpeech,
    createObjectUrl,
    revokeObjectUrl,
    createAudio,
    isDocumentVisible: () => documentVisible,
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

function createProgressiveHarness(playImpl: () => Promise<void> = async () => undefined) {
  const audios: FakeAudio[] = [];
  const requestSpeech = vi.fn(async () => ({
    audio: new Blob(["legacy"], { type: "audio/mpeg" }),
    diagnostics: { ttsModel: "gpt-4o-mini-tts", ttsGenerationMs: 10 },
  }));
  const requestProgressiveSpeech = vi.fn(async () =>
    `/api/translator/speech/native/${"a".repeat(24)}.mp3`);
  const createAudio = vi.fn((url?: string) => {
    const audio = {
      currentTime: 0, duration: 1, load: vi.fn(), pause: vi.fn(),
      play: vi.fn(playImpl), preload: "", src: url ?? "",
      onended: null, onerror: null, onplaying: null, oncanplay: null, onloadstart: null,
    } as unknown as FakeAudio;
    audios.push(audio);
    return audio;
  });
  const player = new TranslatorSpeechPlayer({
    requestSpeech, requestProgressiveSpeech,
    readProgressiveResponseEnd: () => performance.now() + 100,
    readProgressiveFirstChunkAt: async () => "2026-10-07T10:00:00.000Z",
    createAudio, createObjectUrl: () => "blob:legacy",
    revokeObjectUrl: vi.fn(),
  });
  return { audios, player, requestSpeech, requestProgressiveSpeech };
}

describe("TranslatorSpeechPlayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("starts automatic playback normally when the browser permits it", async () => {
    const harness = createHarness();
    const onPlaybackStarted = vi.fn();
    const onPlaybackCompleted = vi.fn();
    const onSpeechGenerated = vi.fn();
    const onSpeechRequestStarted = vi.fn();
    const onSpeechReady = vi.fn();
    const onAudioPreparationStarted = vi.fn();
    const onAudioPreparationCompleted = vi.fn();
    const onPlayRequested = vi.fn();
    const onSpeechDiagnosticsUpdated = vi.fn();

    const playback = harness.player.play(entry, 1, {
      autoplay: true,
      onSpeechGenerated,
      onSpeechRequestStarted,
      onSpeechReady,
      onPlaybackStarted,
      onPlaybackCompleted,
      onAudioPreparationStarted,
      onAudioPreparationCompleted,
      onPlayRequested,
      onSpeechDiagnosticsUpdated,
    });
    await waitForAudio(harness.audios, 1);
    await vi.waitFor(() => expect(onPlaybackStarted).toHaveBeenCalledOnce());
    finishAudio(harness.audios[0]);
    await playback;
    expect(onPlaybackCompleted).toHaveBeenCalledOnce();

    expect(harness.requestSpeech).toHaveBeenCalledOnce();
    expect(onSpeechRequestStarted).toHaveBeenCalledOnce();
    expect(onSpeechReady).toHaveBeenCalledOnce();
    expect(onAudioPreparationStarted).toHaveBeenCalledOnce();
    expect(onAudioPreparationCompleted).toHaveBeenCalledOnce();
    expect(onPlayRequested).toHaveBeenCalledOnce();
    expect(onSpeechDiagnosticsUpdated).toHaveBeenCalledWith({
      ttsOpenAiTotalMs: 350,
    });
    expect(onSpeechGenerated).toHaveBeenCalledWith({
      ttsModel: "gpt-4o-mini-tts",
      ttsGenerationMs: 400,
    });
  });

  it("records play() resolution as started and waits for natural ended before completion", async () => {
    const harness = createHarness();
    const onPlaybackStarted = vi.fn();
    const onPlaybackCompleted = vi.fn();
    const playback = harness.player.play(entry, 1, {
      onPlaybackStarted,
      onPlaybackCompleted,
    });

    await waitForAudio(harness.audios, 1);
    await vi.waitFor(() => expect(onPlaybackStarted).toHaveBeenCalledOnce());
    expect(onPlaybackCompleted).not.toHaveBeenCalled();

    finishAudio(harness.audios[0]);
    await playback;
    expect(onPlaybackCompleted).toHaveBeenCalledOnce();
  });

  it("aborts preparation and never plays a late speech response", async () => {
    let resolveSpeech: (asset: TranslatorSpeechAsset) => void = () => undefined;
    const requestState: { signal: AbortSignal | null } = { signal: null };
    const requestSpeech: TranslatorSpeechPlayerDependencies["requestSpeech"] =
      (_entry, _speed, signal) => {
        requestState.signal = signal;
        return new Promise((resolve) => {
          resolveSpeech = resolve;
        });
      };
    const harness = createHarness([], true, requestSpeech);
    const playback = harness.player.play(entry, 1, { autoplay: true });

    expect(requestState.signal?.aborted).toBe(false);
    harness.player.stopPlayback();
    expect(requestState.signal?.aborted).toBe(true);

    resolveSpeech({
      audio: new Blob(["late audio"], { type: "audio/mpeg" }),
      diagnostics: { ttsModel: "gpt-4o-mini-tts", ttsGenerationMs: 500 },
    });
    await expect(playback).rejects.toMatchObject({ name: "AbortError" });

    expect(harness.createObjectUrl).not.toHaveBeenCalled();
    expect(harness.audios).toHaveLength(0);
  });

  it("classifies an intentional stop before natural ended as interrupted", async () => {
    const harness = createHarness();
    const onPlaybackCompleted = vi.fn();
    const onPlaybackInterrupted = vi.fn();
    const playback = harness.player.play(entry, 1, {
      onPlaybackCompleted,
      onPlaybackInterrupted,
    });
    await waitForAudio(harness.audios, 1);
    await vi.waitFor(() => expect(harness.audios[0].play).toHaveBeenCalledOnce());

    harness.player.stopPlayback();
    await playback;

    expect(onPlaybackCompleted).not.toHaveBeenCalled();
    expect(onPlaybackInterrupted).toHaveBeenCalledOnce();
  });

  it("ignores a stale ended event after the old playback was stopped", async () => {
    const harness = createHarness();
    const onPlaybackCompleted = vi.fn();
    const playback = harness.player.play(entry, 1, { onPlaybackCompleted });
    await waitForAudio(harness.audios, 1);
    const staleEnded = harness.audios[0].onended!;

    harness.player.stopPlayback();
    staleEnded.call(harness.audios[0], new Event("ended"));
    await playback;

    expect(onPlaybackCompleted).not.toHaveBeenCalled();
  });

  it("ignores a stale media error after the old playback was stopped", async () => {
    const harness = createHarness();
    const playback = harness.player.play(entry, 1);
    await waitForAudio(harness.audios, 1);
    const staleError = harness.audios[0].onerror!;

    harness.player.stopPlayback();
    staleError.call(harness.audios[0], new Event("error"));
    await expect(playback).resolves.toBeUndefined();
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
      message:
        "Audio ist bereit. Tippe einmal auf „Abspielen“ – es wird nicht neu erzeugt.",
    });
    expect(infoSpy).toHaveBeenCalledWith(
      '[translator][speech playback blocked] {"name":"NotAllowedError","autoplay":true}',
    );

    const manualPlayback = harness.player.play(entry, 1, { autoplay: false });
    expect(harness.createAudio).toHaveBeenCalledOnce();
    finishAudio(harness.audios[0]);
    await manualPlayback;

    expect(harness.requestSpeech).toHaveBeenCalledOnce();
    expect(harness.createObjectUrl).toHaveBeenCalledOnce();
  });

  it("reuses the audio element prepared in the recording gesture", async () => {
    const harness = createHarness();

    harness.player.prepareForUserGesture();

    expect(harness.createAudio).toHaveBeenCalledOnce();
    expect(harness.audios[0].play).not.toHaveBeenCalled();

    const playback = harness.player.play(entry, 1);
    await vi.waitFor(() => expect(harness.audios[0].play).toHaveBeenCalledOnce());
    expect(harness.createAudio).toHaveBeenCalledOnce();
    expect(harness.audios[0].src).toBe("blob:translation-1");
    expect(harness.audios[0].load).toHaveBeenCalledOnce();
    finishAudio(harness.audios[0]);
    await playback;
  });

  it("keeps audio ready without attempting autoplay while the page is hidden", async () => {
    const harness = createHarness([], false);
    const onSpeechReady = vi.fn();

    await expect(
      harness.player.play(entry, 1, { autoplay: true, onSpeechReady }),
    ).rejects.toMatchObject({ name: "NotAllowedError" });

    expect(onSpeechReady).toHaveBeenCalledOnce();
    expect(harness.player.hasCachedAudio(entry.id, 1)).toBe(true);
    expect(harness.audios[0].play).not.toHaveBeenCalled();
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
      '[translator][speech playback error] {"name":"NotSupportedError","autoplay":true}',
    );
  });

  it("classifies a failure before speech is ready as generation failure", () => {
    expect(getTranslatorSpeechFailure(new Error("player unavailable"), true, false))
      .toEqual({
        kind: "generation",
        message: "Die Sprachausgabe konnte nicht erstellt werden.",
      });
  });

  it("generates audio on first replay and reuses the local cache", async () => {
    const harness = createHarness();

    const firstPlayback = harness.player.play(entry, 1);
    await waitForAudio(harness.audios, 1);
    finishAudio(harness.audios[0]);
    await firstPlayback;

    const secondPlayback = harness.player.play(entry, 1);
    finishAudio(harness.audios[0]);
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
    finishAudio(harness.audios[1]);
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
    expect(harness.createAudio).toHaveBeenCalledOnce();

    expect(harness.audios[0].pause).toHaveBeenCalledOnce();
    expect(harness.audios[0].currentTime).toBe(0);
    await firstPlayback;
    finishAudio(harness.audios[0]);
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

    expect(harness.audios[0].pause).toHaveBeenCalled();
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith("blob:translation-1");
    expect(harness.player.hasCachedAudio(entry.id, 1)).toBe(false);
    await playback;
  });

  it("stops audio and releases URLs when disposed on unmount", async () => {
    const harness = createHarness();
    const playback = harness.player.play(entry, 1);
    await waitForAudio(harness.audios, 1);

    harness.player.dispose();

    expect(harness.audios[0].pause).toHaveBeenCalled();
    expect(harness.revokeObjectUrl).toHaveBeenCalledOnce();
    await playback;
    await expect(harness.player.play(entry, 1)).rejects.toThrow(
      "Speech player is disposed",
    );
  });

  it("does not start delayed audio after a pending request was stopped", async () => {
    let resolveRequest!: (asset: TranslatorSpeechAsset) => void;
    const requestSpeech = vi.fn(
      () =>
        new Promise<TranslatorSpeechAsset>((resolve) => {
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
    resolveRequest({
      audio: new Blob(["audio"], { type: "audio/mpeg" }),
      diagnostics: {
        ttsModel: "gpt-4o-mini-tts",
        ttsGenerationMs: 400,
      },
    });

    await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(createAudio).not.toHaveBeenCalled();
  });
});

describe("native progressive MP3 spike", () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("starts on playing, before stream completion, and never requests legacy", async () => {
    const h = createProgressiveHarness();
    const diagnostics = vi.fn();
    const started = vi.fn();
    const completed = vi.fn();
    const playback = h.player.play(entry, 1, {
      autoplay: true, onProgressiveDiagnostics: diagnostics,
      onPlaybackStarted: started, onPlaybackCompleted: completed,
    });
    await vi.waitFor(() => expect(h.audios[0]?.play).toHaveBeenCalledOnce());
    expect(started).not.toHaveBeenCalled();
    h.audios[0].oncanplay?.call(h.audios[0], new Event("canplay"));
    h.audios[0].onplaying?.call(h.audios[0], new Event("playing"));
    expect(started).toHaveBeenCalledOnce();
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ progressiveTtsPlaybackStartedAt: expect.any(String) }));
    expect(completed).not.toHaveBeenCalled();
    h.audios[0].onended?.call(h.audios[0], new Event("ended"));
    await playback;
    expect(completed).toHaveBeenCalledOnce();
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ progressiveTtsPlaybackStartedBeforeStreamCompleted: true }));
    expect(h.requestSpeech).not.toHaveBeenCalled();
  });

  it("falls back automatically on a pre-playback media error without double audio", async () => {
    const h = createProgressiveHarness();
    const diagnostics = vi.fn();
    const playback = h.player.play(entry, 1, { onProgressiveDiagnostics: diagnostics });
    await vi.waitFor(() => expect(h.audios[0]?.play).toHaveBeenCalledOnce());
    h.audios[0].onerror?.call(h.audios[0], new Event("error"));
    await vi.waitFor(() => expect(h.requestSpeech).toHaveBeenCalledOnce());
    expect(h.audios).toHaveLength(1); // same prepared element reused
    expect(h.audios[0].src).toBe("blob:legacy");
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      progressiveTtsFallbackUsed: true,
      progressiveTtsFallbackReason: "progressive_media_error",
    }));
    h.audios[0].onended?.call(h.audios[0], new Event("ended"));
    await playback;
  });

  it("captures Safari MediaError and early media events before the unchanged fallback", async () => {
    vi.stubGlobal("location", { origin: "https://preview.example" });
    const h = createProgressiveHarness();
    const diagnostics = vi.fn();
    const playback = h.player.play(entry, 1, { onProgressiveDiagnostics: diagnostics });
    await vi.waitFor(() => expect(h.audios[0]?.play).toHaveBeenCalledOnce());
    const audio = h.audios[0];
    Object.assign(audio, {
      error: { code: 4, message: "Failed https://preview.example/api/translator/speech/native/aaaaaaaaaaaaaaaaaaaaaaaa.mp3?token=sensitive" },
      networkState: 3, readyState: 0,
      currentSrc: "https://preview.example/api/translator/speech/native/aaaaaaaaaaaaaaaaaaaaaaaa.mp3?token=sensitive",
    });
    audio.onloadstart?.call(audio, new Event("loadstart"));
    audio.onstalled?.call(audio, new Event("stalled"));
    audio.onerror?.call(audio, new Event("error"));
    await vi.waitFor(() => expect(h.requestSpeech).toHaveBeenCalledOnce());
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      progressiveTtsLoadStartAt: expect.any(String),
    }));
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      progressiveTtsStalledAt: expect.any(String),
    }));
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      progressiveTtsErrorAt: expect.any(String),
    }));
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      progressiveTtsMediaErrorCode: 4,
      progressiveTtsMediaErrorMessage: "Failed [media URL]",
      progressiveTtsMediaNetworkState: 3,
      progressiveTtsMediaReadyState: 0,
      progressiveTtsMediaCurrentSrc: "https://preview.example/api/translator/speech/native/<media-id>.mp3",
    }));
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      progressiveTtsFallbackReason: "progressive_media_error",
    }));
    h.player.stopPlayback();
    await playback;
  });

  it("falls back when autoplay is rejected before playing", async () => {
    let playCount = 0;
    const h = createProgressiveHarness(async () => {
      if (playCount++ === 0) throw new DOMException("blocked", "NotAllowedError");
    });
    const diagnostics = vi.fn();
    const playback = h.player.play(entry, 1, { autoplay: true, onProgressiveDiagnostics: diagnostics });
    await vi.waitFor(() => expect(h.requestSpeech).toHaveBeenCalledOnce());
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      progressiveTtsFallbackReason: "progressive_autoplay_rejected",
    }));
    h.player.stopPlayback();
    await playback;
  });

  it("stops before playback, invalidating a late ticket without legacy start", async () => {
    const h = createProgressiveHarness();
    let resolveTicket!: (url: string) => void;
    h.requestProgressiveSpeech.mockImplementation(() => new Promise((resolve) => { resolveTicket = resolve; }));
    const playback = h.player.play(entry, 1);
    h.player.stopPlayback();
    resolveTicket(`/api/translator/speech/native/${"a".repeat(24)}.mp3`);
    await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(h.audios).toHaveLength(0);
    expect(h.requestSpeech).not.toHaveBeenCalled();
  });

  it("interrupts after playback and ignores the old ended event", async () => {
    const h = createProgressiveHarness();
    const interrupted = vi.fn();
    const completed = vi.fn();
    const playback = h.player.play(entry, 1, { onPlaybackInterrupted: interrupted, onPlaybackCompleted: completed });
    await vi.waitFor(() => expect(h.audios[0]?.play).toHaveBeenCalledOnce());
    const oldPlaying = h.audios[0].onplaying!;
    oldPlaying.call(h.audios[0], new Event("playing"));
    const oldEnded = h.audios[0].onended!;
    h.player.stopPlayback();
    oldEnded.call(h.audios[0], new Event("ended"));
    await playback;
    expect(interrupted).toHaveBeenCalledOnce();
    expect(completed).not.toHaveBeenCalled();
    expect(h.requestSpeech).not.toHaveBeenCalled();
  });

  it("does not fall back after confirmed progressive playback, even on media error", async () => {
    const h = createProgressiveHarness();
    const playback = h.player.play(entry, 1);
    await vi.waitFor(() => expect(h.audios[0]?.play).toHaveBeenCalledOnce());
    h.audios[0].onplaying?.call(h.audios[0], new Event("playing"));
    h.audios[0].onerror?.call(h.audios[0], new Event("error"));
    await expect(playback).rejects.toMatchObject({ reason: "progressive_playback_failed_after_start" });
    expect(h.requestSpeech).not.toHaveBeenCalled();
  });

  it("falls back on a pending play() after the startup timeout", async () => {
    vi.useFakeTimers();
    const h = createProgressiveHarness(() => new Promise<void>(() => undefined));
    const playback = h.player.play(entry, 1);
    await vi.waitFor(() => expect(h.audios[0]?.play).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(NATIVE_PROGRESSIVE_PLAYBACK_START_TIMEOUT_MS);
    expect(h.requestSpeech).toHaveBeenCalledOnce();
    h.player.stopPlayback();
    await playback;
  });
});
