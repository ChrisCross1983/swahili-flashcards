import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranslationEntry, TranslationDiagnostics } from "@/lib/translator/types";
import type { TranslatorSpeechAsset } from "@/lib/translator/speechClient";
import { FirstSegmentNotStartedError, FirstSentenceSpeechPlayer } from "@/lib/translator/firstSentenceSpeechPlayer";
import { splitFirstSentenceForSpeech } from "@/lib/translator/firstSentenceFastTts";

const text = "Leo ilikuwa siku yenye shughuli nyingi sana. Asubuhi nilikwenda sokoni na kununua matunda mengi. Baadaye nilikutana na rafiki yangu na tukazungumza kwa muda mrefu. Jioni nilirudi nyumbani, nikapika chakula, na nikapumzika baada ya siku ndefu yenye shughuli nyingi na mazungumzo mazuri pamoja na marafiki zangu wa karibu.";
const entry: TranslationEntry = {
  id: "long-turn", timestamp: 1, sourceLanguage: "de", targetLanguage: "sw",
  originalText: "Ein langer deutscher Text.", translatedText: text, sourceWasDetected: false,
};
const split = splitFirstSentenceForSpeech(text)!;

type FakeAudio = HTMLAudioElement & { play: ReturnType<typeof vi.fn> };
const asset = (label: string): TranslatorSpeechAsset => ({
  audio: new Blob([label], { type: "audio/mpeg" }),
  diagnostics: {
    ttsModel: "gpt-4o-mini-tts", ttsGenerationMs: 50,
    ttsOpenAiTimeToFirstByteMs: 10, ttsOpenAiTotalMs: 40,
    ttsClientDownloadTotalMs: 30,
  },
});

function gate<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(requestOverride?: (segment: 1 | 2, signal: AbortSignal) => Promise<TranslatorSpeechAsset>,
  playOverride?: (audio: FakeAudio) => Promise<void>) {
  const audios: FakeAudio[] = [];
  const revoked: string[] = [];
  const requests: Array<{ text: string; segment: number; signal: AbortSignal }> = [];
  const diagnostics: Partial<TranslationDiagnostics>[] = [];
  const onPlaybackStarted = vi.fn();
  const onPlaybackCompleted = vi.fn();
  const onPlaybackInterrupted = vi.fn();
  const onSpeechReady = vi.fn();
  let urlIndex = 0;
  const player = new FirstSentenceSpeechPlayer({
    requestSpeech: (part, _entry, _speed, signal, segment) => {
      requests.push({ text: part, segment, signal });
      return requestOverride?.(segment, signal) ?? Promise.resolve(asset(`audio-${segment}`));
    },
    createObjectUrl: () => `blob:seg-${++urlIndex}`,
    revokeObjectUrl: (url) => { revoked.push(url); },
    createAudio: () => {
      const audio = {
        currentTime: 0, duration: 4, load: vi.fn(), pause: vi.fn(),
        play: vi.fn(function (this: FakeAudio) {
          return playOverride?.(this) ?? Promise.resolve();
        }),
        onended: null, onerror: null, preload: "", src: "",
      } as unknown as FakeAudio;
      audios.push(audio);
      return audio;
    },
    isDocumentVisible: () => true,
  });
  const options = {
    autoplay: true, onPlaybackStarted, onPlaybackCompleted, onPlaybackInterrupted,
    onSpeechReady, onSegmentedDiagnostics: (value: Partial<TranslationDiagnostics>) => {
      diagnostics.push(value);
    },
  };
  return { player, audios, requests, revoked, diagnostics, options,
    onPlaybackStarted, onPlaybackCompleted, onPlaybackInterrupted, onSpeechReady };
}

function end(audio: FakeAudio) {
  audio.currentTime = audio.duration;
  audio.onended?.call(audio, new Event("ended"));
}

async function firstStarted(h: ReturnType<typeof harness>) {
  await vi.waitFor(() => expect(h.onPlaybackStarted).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(h.requests).toHaveLength(2));
}

afterEach(() => vi.restoreAllMocks());

describe("FirstSentenceSpeechPlayer", () => {
  it("sends exact Terra text in two ordered requests and completes only after segment 2", async () => {
    const h = harness();
    const playback = h.player.play(entry, 1, split, h.options);
    expect(h.requests.map((r) => r.segment)).toEqual([1]);
    await firstStarted(h);
    expect(h.requests[0].text + h.requests[1].text).toBe(text);
    expect(h.audios[0].play).toHaveBeenCalledOnce();
    expect(h.audios[1]?.play).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(h.onSpeechReady).toHaveBeenCalledOnce());
    expect(h.onPlaybackCompleted).not.toHaveBeenCalled();
    end(h.audios[0]);
    await vi.waitFor(() => expect(h.audios[1].play).toHaveBeenCalledOnce());
    expect(h.diagnostics.some((value) => value.segmentedTtsSegment2ReadyBeforeSegment1End === true)).toBe(true);
    end(h.audios[1]);
    await playback;
    expect(h.onPlaybackCompleted).toHaveBeenCalledOnce();
    expect(h.diagnostics.some((value) => value.segmentedTtsTotalPlaybackCompletedAt)).toBe(true);
  });

  it("measures a nonnegative gap when segment 2 arrives after segment 1 ended", async () => {
    const second = gate<TranslatorSpeechAsset>();
    const h = harness((segment) => segment === 1 ? Promise.resolve(asset("first")) : second.promise);
    const playback = h.player.play(entry, 1, split, h.options);
    await firstStarted(h);
    end(h.audios[0]);
    expect(h.audios).toHaveLength(1);
    expect(h.onSpeechReady).not.toHaveBeenCalled();
    second.resolve(asset("second"));
    await vi.waitFor(() => expect(h.audios[1].play).toHaveBeenCalledOnce());
    expect(h.onSpeechReady).toHaveBeenCalledOnce();
    end(h.audios[1]);
    await playback;
    expect(h.diagnostics.some((value) => value.segmentedTtsSegment2ReadyBeforeSegment1End === false)).toBe(true);
    expect(h.diagnostics.find((value) => typeof value.segmentedTtsGapMs === "number")?.segmentedTtsGapMs).toBeGreaterThanOrEqual(0);
  });

  it("does not request segment 2 until play() confirms the first playback", async () => {
    const started = gate<void>();
    const h = harness(undefined, (audio) => audio === h.audios[0] ? started.promise : Promise.resolve());
    const playback = h.player.play(entry, 1, split, h.options);
    await vi.waitFor(() => expect(h.audios[0]?.play).toHaveBeenCalledOnce());
    expect(h.requests).toHaveLength(1);
    expect(h.onPlaybackStarted).not.toHaveBeenCalled();
    started.resolve();
    await firstStarted(h);
    end(h.audios[0]);
    await vi.waitFor(() => expect(h.audios[1]?.play).toHaveBeenCalledOnce());
    end(h.audios[1]);
    await playback;
  });

  it("falls back when the first play() promise is rejected before playback", async () => {
    const h = harness(undefined, () => Promise.reject(new DOMException("blocked", "NotAllowedError")));
    await expect(h.player.play(entry, 1, split, h.options)).rejects.toBeInstanceOf(FirstSegmentNotStartedError);
    expect(h.requests).toHaveLength(1);
    expect(h.onPlaybackStarted).not.toHaveBeenCalled();
    expect(h.diagnostics.some((value) => value.segmentedTtsFallbackReason === "segment1_before_playback_failed")).toBe(true);
  });

  it("aborts a pending first play() without starting the next segment", async () => {
    const pendingPlay = gate<void>();
    const h = harness(undefined, () => pendingPlay.promise);
    const playback = h.player.play(entry, 1, split, h.options);
    await vi.waitFor(() => expect(h.audios[0]?.play).toHaveBeenCalledOnce());
    h.player.stopPlayback();
    pendingPlay.resolve();
    await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(h.requests).toHaveLength(1);
    expect(h.onPlaybackStarted).not.toHaveBeenCalled();
    expect(h.onPlaybackInterrupted).not.toHaveBeenCalled();
  });

  it("aborts both the old operation and a late segment 1 response before audio starts", async () => {
    const first = gate<TranslatorSpeechAsset>();
    const h = harness(() => first.promise);
    const playback = h.player.play(entry, 1, split, h.options);
    h.player.stopPlayback();
    expect(h.requests[0].signal.aborted).toBe(true);
    first.resolve(asset("late"));
    await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(h.audios).toHaveLength(0);
  });

  it.each(["segment 1", "gap", "segment 2"])("stops during %s without a second audible asset", async (phase) => {
    const second = gate<TranslatorSpeechAsset>();
    const h = harness((segment) => segment === 1 ? Promise.resolve(asset("first")) : second.promise);
    const playback = h.player.play(entry, 1, split, h.options);
    await firstStarted(h);
    if (phase !== "segment 1") end(h.audios[0]);
    if (phase === "segment 2") {
      second.resolve(asset("second"));
      await vi.waitFor(() => expect(h.audios[1].play).toHaveBeenCalledOnce());
    }
    h.player.stopPlayback();
    if (phase !== "segment 2") second.resolve(asset("late"));
    await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(h.onPlaybackInterrupted).toHaveBeenCalledOnce();
    if (phase !== "segment 2") expect(h.audios[1]?.play.mock.calls.length ?? 0).toBe(0);
  });

  it("allows full-text fallback only when segment 1 never started", async () => {
    const h = harness(() => Promise.reject(new Error("first request failed")));
    await expect(h.player.play(entry, 1, split, h.options)).rejects.toBeInstanceOf(FirstSegmentNotStartedError);
    expect(h.diagnostics.some((value) => value.segmentedTtsFallbackUsed === true)).toBe(true);
    expect(h.onPlaybackStarted).not.toHaveBeenCalled();
  });

  it("does not replay the full text after segment 2 fails following first audio", async () => {
    const h = harness((segment) => segment === 1
      ? Promise.resolve(asset("first")) : Promise.reject(new Error("second request failed")));
    const playback = h.player.play(entry, 1, split, h.options);
    await firstStarted(h);
    end(h.audios[0]);
    await expect(playback).rejects.toThrow("second request failed");
    expect(h.requests).toHaveLength(2);
    expect(h.audios).toHaveLength(1);
    expect(h.diagnostics.some((value) => value.segmentedTtsFailureReason === "segment_after_playback_failed")).toBe(true);
  });

  it("does not restart full-text TTS when segment 2 audio fails after first playback", async () => {
    const h = harness(undefined, (audio) => audio === h.audios[0]
      ? Promise.resolve() : Promise.reject(new Error("second audio failed")));
    const playback = h.player.play(entry, 1, split, h.options);
    await firstStarted(h);
    await vi.waitFor(() => expect(h.audios).toHaveLength(2));
    end(h.audios[0]);
    await expect(playback).rejects.toThrow("second audio failed");
    expect(h.requests).toHaveLength(2);
    expect(h.onPlaybackCompleted).not.toHaveBeenCalled();
  });

  it("aborts a late second response when a new turn supersedes the old one", async () => {
    const late = gate<TranslatorSpeechAsset>();
    let secondRequests = 0;
    const h = harness((segment) => {
      if (segment === 1) return Promise.resolve(asset("first"));
      return ++secondRequests === 1 ? late.promise : Promise.resolve(asset("next-second"));
    });
    const old = h.player.play(entry, 1, split, h.options);
    await firstStarted(h);
    h.player.stopPlayback();
    const next = h.player.play({ ...entry, id: "new-turn" }, 1, split, h.options);
    late.resolve(asset("late-second"));
    await expect(old).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(h.requests).toHaveLength(4));
    await vi.waitFor(() => expect(h.audios).toHaveLength(3));
    expect(h.audios).toHaveLength(3); // late old segment never became an asset
    end(h.audios[1]);
    await vi.waitFor(() => expect(h.audios[2].play).toHaveBeenCalledOnce());
    end(h.audios[2]);
    await next;
  });

  it("pauses, resumes and completes a manual two-part replay without extra synthesis", async () => {
    const h = harness();
    const playback = h.player.play(entry, 1, split, { ...h.options, autoplay: false });
    await firstStarted(h);
    expect(h.player.pausePlayback()).toBe(true);
    await h.player.resumePlayback();
    await vi.waitFor(() => expect(h.audios).toHaveLength(2));
    end(h.audios[0]);
    await vi.waitFor(() => expect(h.audios[1].play).toHaveBeenCalledOnce());
    end(h.audios[1]);
    await playback;
    expect(h.requests).toHaveLength(2);
    expect(h.onPlaybackCompleted).toHaveBeenCalledOnce();
  });

  it("disposes a pending request on unmount and releases prepared assets", async () => {
    const first = gate<TranslatorSpeechAsset>();
    const h = harness(() => first.promise);
    h.player.prepareForUserGesture();
    const playback = h.player.play(entry, 1, split, h.options);
    h.player.dispose();
    expect(h.requests[0].signal.aborted).toBe(true);
    first.resolve(asset("late"));
    await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(h.audios.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);
  });

  it("replays both cached segments without a new request", async () => {
    const h = harness();
    const firstPlayback = h.player.play(entry, 1, split, h.options);
    await firstStarted(h);
    await vi.waitFor(() => expect(h.audios).toHaveLength(2));
    end(h.audios[0]);
    await vi.waitFor(() => expect(h.audios[1].play).toHaveBeenCalledOnce());
    end(h.audios[1]);
    await firstPlayback;
    expect(h.player.hasCachedAudio(entry.id, 1)).toBe(true);
    const replay = h.player.play(entry, 1, split, h.options);
    await vi.waitFor(() => expect(h.audios[0].play).toHaveBeenCalledTimes(2));
    end(h.audios[0]);
    await vi.waitFor(() => expect(h.audios[1].play).toHaveBeenCalledTimes(2));
    end(h.audios[1]);
    await replay;
    expect(h.requests).toHaveLength(2);
    h.player.dispose();
    expect(h.revoked).toEqual(["blob:seg-1", "blob:seg-2"]);
  });

  it("ignores a stale ended event after a new turn begins", async () => {
    const h = harness();
    const old = h.player.play(entry, 1, split, h.options);
    await firstStarted(h);
    const oldEnd = h.audios[0].onended!;
    h.player.stopPlayback();
    const next = h.player.play({ ...entry, id: "new-turn" }, 1, split, h.options);
    oldEnd.call(h.audios[0], new Event("ended"));
    await expect(old).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(h.requests).toHaveLength(4));
    await vi.waitFor(() => expect(h.audios).toHaveLength(4));
    end(h.audios[2]);
    await vi.waitFor(() => expect(h.audios[3].play).toHaveBeenCalledOnce());
    end(h.audios[3]);
    await next;
    expect(h.onPlaybackCompleted).toHaveBeenCalledOnce();
  });
});
