import type { TranslationEntry, TranslationDiagnostics } from "@/lib/translator/types";
import type { FirstSentenceSplit } from "@/lib/translator/firstSentenceFastTts";
import { getSpeechCacheKey } from "@/lib/translator/speechSpeed";
import type { TranslatorSpeechAsset } from "@/lib/translator/speechClient";
import type {
  TranslatorSpeechPlaybackOptions,
  TranslatorSpeechPlaybackPosition,
} from "@/lib/translator/translatorSpeechPlayer";

type SegmentAudio = Pick<HTMLAudioElement,
  "currentSrc" | "currentTime" | "duration" | "load" | "networkState" |
  "oncanplay" | "onended" | "onerror" | "onloadstart" | "onplaying" |
  "pause" | "paused" | "play" | "preload" | "readyState" | "src">;

type Asset = { audio: SegmentAudio; url: string; byteLength: number; mimeType: string };
type Pair = [Asset, Asset];

export type FirstSentenceSpeechDependencies = {
  requestSpeech: (text: string, entry: TranslationEntry, speed: number, signal: AbortSignal, segment: 1 | 2) => Promise<TranslatorSpeechAsset>;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  createAudio: () => SegmentAudio;
  isDocumentVisible: () => boolean;
};

export class FirstSegmentNotStartedError extends Error {
  constructor(public readonly cause: unknown) {
    super("First speech segment did not start");
    this.name = "FirstSegmentNotStartedError";
  }
}

function abortError() {
  return new DOMException("Segmented speech was stopped", "AbortError");
}

function position(audio: SegmentAudio): TranslatorSpeechPlaybackPosition {
  const finite = (value: number) => Number.isFinite(value) && value >= 0 ? value : null;
  return { currentTime: finite(audio.currentTime), duration: finite(audio.duration) };
}

function stopAudio(audio: SegmentAudio | null) {
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  audio.onloadstart = null;
  audio.oncanplay = null;
  audio.onplaying = null;
  audio.pause();
  try { audio.currentTime = 0; } catch { /* Metadata may not be ready. */ }
}

function elapsed(start: number) {
  return Math.max(0, Math.round(performance.now() - start));
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  // Stop may reject either phase before its consumer reaches an await.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/** One logical playback operation, two full MP3 assets, never two audible elements. */
export class FirstSentenceSpeechPlayer {
  private readonly cache = new Map<string, Pair>();
  private operationId = 0;
  private requestController: AbortController | null = null;
  private activeAudio: SegmentAudio | null = null;
  private queuedAudio: SegmentAudio | null = null;
  private preparedAudio: SegmentAudio | null = null;
  private activeCancel: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly dependencies: FirstSentenceSpeechDependencies) {}

  hasCachedAudio(entryId: string, speed: number) {
    return this.cache.has(getSpeechCacheKey(entryId, speed));
  }

  prepareForUserGesture() {
    if (this.disposed || this.preparedAudio) return;
    this.preparedAudio = this.dependencies.createAudio();
    this.preparedAudio.preload = "auto";
  }

  async play(entry: TranslationEntry, speed: number, split: FirstSentenceSplit,
    options: TranslatorSpeechPlaybackOptions) {
    if (this.disposed) throw abortError();
    this.stopPlayback();
    const operation = this.operationId;
    const requestStart = performance.now();
    const key = getSpeechCacheKey(entry.id, speed);
    const fromCache = this.cache.has(key);
    let pair = this.cache.get(key);
    let ownedByCache = fromCache;
    let first: Asset | null = pair?.[0] ?? null;
    let second: Asset | null = pair?.[1] ?? null;
    let firstStarted = false;
    let firstEndAt: number | null = null;
    let firstDuration: number | null = null;
    let completed = false;
    const pending = new Set<Deferred<unknown>>();
    const emit = (values: Partial<TranslationDiagnostics>) => options.onSegmentedDiagnostics?.(values);
    const current = () => !this.disposed && this.operationId === operation;
    const assertCurrent = () => { if (!current()) throw abortError(); };
    const secondAudioState = (audio: SegmentAudio) => ({
      segmentedTtsSegment2AudioReadyState: Number.isFinite(audio.readyState) ? audio.readyState : null,
      segmentedTtsSegment2AudioNetworkState: Number.isFinite(audio.networkState) ? audio.networkState : null,
      segmentedTtsSegment2AudioPaused: typeof audio.paused === "boolean" ? audio.paused : null,
      segmentedTtsSegment2AudioCurrentSrc: audio.currentSrc?.startsWith("blob:") ? audio.currentSrc : null,
    });
    const secondPlayError = (error: unknown) => ({
      segmentedTtsSegment2PlayErrorName: error && typeof error === "object" && "name" in error &&
        typeof error.name === "string" ? error.name : "UnknownError",
      segmentedTtsSegment2PlayErrorMessage: error instanceof Error ? error.message.slice(0, 300) : null,
    });
    const cancel = () => {
      if (completed) return;
      const activePosition = this.activeAudio ? position(this.activeAudio) : { currentTime: null, duration: null };
      if (firstStarted) options.onPlaybackInterrupted?.({
        currentTime: activePosition.currentTime === null ? null :
          (this.activeAudio === second?.audio && firstDuration !== null
            ? firstDuration + activePosition.currentTime : activePosition.currentTime),
        duration: firstDuration !== null && second?.audio && Number.isFinite(second.audio.duration)
          ? firstDuration + second.audio.duration : activePosition.duration,
      });
      stopAudio(this.activeAudio);
      stopAudio(this.queuedAudio);
      for (const wait of pending) wait.reject(abortError());
      pending.clear();
    };
    this.activeCancel = cancel;
    emit({
      segmentedTtsEligible: true, segmentedTtsUsed: true, segmentedTtsSegmentCount: 2,
      segmentedTtsSegment1TextLength: split.first.length,
      segmentedTtsSegment2TextLength: split.rest.length,
      segmentedTtsFallbackUsed: false,
      segmentedTtsFallbackReason: null,
      segmentedTtsFailureReason: null,
      segmentedTtsGapMs: null,
    });

    const request = async (text: string, number: 1 | 2) => {
      const controller = new AbortController();
      this.requestController = controller;
      const started = performance.now();
      const startedAt = new Date().toISOString();
      emit(number === 1
        ? { segmentedTtsSegment1RequestStartedAt: startedAt }
        : { segmentedTtsSegment2RequestStartedAt: startedAt });
      if (number === 1) options.onSpeechRequestStarted?.();
      try {
        const result = await this.dependencies.requestSpeech(text, entry, speed, controller.signal, number);
        assertCurrent();
        const readyAt = new Date().toISOString();
        emit(number === 1 ? {
          segmentedTtsSegment1ReadyAt: readyAt,
          segmentedTtsSegment1TtfbMs: result.diagnostics.ttsOpenAiTimeToFirstByteMs ?? null,
          segmentedTtsSegment1OpenAiTotalMs: result.diagnostics.ttsOpenAiTotalMs ?? null,
          segmentedTtsSegment1ClientDownloadMs: result.diagnostics.ttsClientDownloadTotalMs ?? null,
          segmentedTtsFirstSegmentRequestToReadyMs: elapsed(started),
          ttsModel: result.diagnostics.ttsModel,
          ttsInputTextLength: entry.translatedText.length,
        } : {
          segmentedTtsSegment2ReadyAt: readyAt,
          segmentedTtsSegment2TtfbMs: result.diagnostics.ttsOpenAiTimeToFirstByteMs ?? null,
          segmentedTtsSegment2OpenAiTotalMs: result.diagnostics.ttsOpenAiTotalMs ?? null,
          segmentedTtsSegment2ClientDownloadMs: result.diagnostics.ttsClientDownloadTotalMs ?? null,
        });
        void result.serverDiagnostics?.then((diagnostics) => {
          if (!current() || !diagnostics) return;
          const timings = {
            ...(typeof diagnostics.ttsOpenAiTimeToFirstByteMs === "number"
              ? { ttfb: diagnostics.ttsOpenAiTimeToFirstByteMs } : {}),
            ...(typeof diagnostics.ttsOpenAiTotalMs === "number"
              ? { total: diagnostics.ttsOpenAiTotalMs } : {}),
          };
          emit(number === 1 ? {
            ...(timings.ttfb !== undefined ? { segmentedTtsSegment1TtfbMs: timings.ttfb } : {}),
            ...(timings.total !== undefined ? { segmentedTtsSegment1OpenAiTotalMs: timings.total } : {}),
          } : {
            ...(timings.ttfb !== undefined ? { segmentedTtsSegment2TtfbMs: timings.ttfb } : {}),
            ...(timings.total !== undefined ? { segmentedTtsSegment2OpenAiTotalMs: timings.total } : {}),
          });
        }).catch(() => undefined);
        return result;
      } finally {
        if (this.requestController === controller) this.requestController = null;
      }
    };
    const prepare = (asset: TranslatorSpeechAsset, usePrepared: boolean): Asset => {
      assertCurrent();
      const url = this.dependencies.createObjectUrl(asset.audio);
      try {
        const audio = usePrepared && this.preparedAudio
          ? this.preparedAudio : this.dependencies.createAudio();
        if (usePrepared) this.preparedAudio = null;
        audio.preload = "auto";
        if (!usePrepared) {
          audio.onloadstart = () => {
            if (current()) emit({ segmentedTtsSegment2LoadStartAt: new Date().toISOString() });
          };
          audio.oncanplay = () => {
            if (current()) emit({ segmentedTtsSegment2CanPlayAt: new Date().toISOString(), ...secondAudioState(audio) });
          };
          audio.onerror = () => {
            if (current()) emit({ segmentedTtsSegment2ErrorAt: new Date().toISOString(), ...secondAudioState(audio) });
          };
        }
        audio.src = url;
        audio.load();
        return { audio, url, byteLength: asset.audio.size, mimeType: asset.audio.type };
      } catch (error) {
        this.dependencies.revokeObjectUrl(url);
        throw error;
      }
    };
    const playAsset = (asset: Asset, onStart: () => void, segment: 1 | 2) => {
      const started = deferred<void>();
      const ended = deferred<TranslatorSpeechPlaybackPosition>();
      pending.add(started as Deferred<unknown>);
      pending.add(ended as Deferred<unknown>);
      const audio = asset.audio;
      this.queuedAudio = null;
      this.activeAudio = audio;
      if (segment === 2) {
        audio.onplaying = () => {
          if (current()) emit({ segmentedTtsSegment2PlayingAt: new Date().toISOString(), ...secondAudioState(audio) });
        };
      }
      audio.onended = () => {
        if (!current()) return;
        if (segment === 2) emit({ segmentedTtsSegment2EndedAt: new Date().toISOString(), ...secondAudioState(audio) });
        const atEnd = position(audio);
        stopAudio(audio);
        if (this.activeAudio === audio) this.activeAudio = null;
        pending.delete(ended as Deferred<unknown>);
        ended.resolve(atEnd);
      };
      audio.onerror = () => {
        if (!current()) return;
        if (segment === 2) emit({ segmentedTtsSegment2ErrorAt: new Date().toISOString(), ...secondAudioState(audio) });
        const error = new Error("Segmented speech audio could not be played");
        started.reject(error);
        ended.reject(error);
      };
      const rejectPlay = (error: unknown) => {
        if (segment === 2 && current()) emit({
          segmentedTtsSegment2PlayRejectedAt: new Date().toISOString(),
          ...secondPlayError(error), ...secondAudioState(audio),
        });
        started.reject(error);
        ended.reject(error);
      };
      try {
        if (segment === 2) emit({ segmentedTtsSegment2PlayInvokedAt: new Date().toISOString(), ...secondAudioState(audio) });
        void audio.play().then(() => {
          if (!current()) { started.reject(abortError()); ended.reject(abortError()); return; }
          if (segment === 2) emit({ segmentedTtsSegment2PlayResolvedAt: new Date().toISOString(), ...secondAudioState(audio) });
          pending.delete(started as Deferred<unknown>);
          onStart();
          started.resolve();
        }, rejectPlay);
      } catch (error) { rejectPlay(error); }
      return { started: started.promise, ended: ended.promise };
    };

    try {
      if (!first) {
        const firstAsset = await request(split.first, 1);
        options.onAudioPreparationStarted?.();
        first = prepare(firstAsset, true);
        options.onAudioPreparationCompleted?.();
      }
      assertCurrent();
      if (options.autoplay && !this.dependencies.isDocumentVisible()) {
        throw new DOMException("Automatic playback requires a visible page", "NotAllowedError");
      }
      options.onPlaybackAttempt?.({
        generationId: `segmented-tts-${operation}`,
        playbackAttemptId: `segmented-playback-${operation}`,
        fromCache,
      });
      options.onPlayRequested?.();
      const firstPlay = playAsset(first, () => {
        firstStarted = true;
        const now = new Date().toISOString();
        emit({
          segmentedTtsSegment1PlaybackStartedAt: now,
          segmentedTtsFirstAudioStartMs: elapsed(requestStart),
        });
        options.onPlaybackStarted?.();
      }, 1);
      await firstPlay.started;
      assertCurrent();
      const firstEnded = firstPlay.ended.then((value) => {
        firstDuration = value.duration;
        firstEndAt = performance.now();
        emit({ segmentedTtsSegment1PlaybackCompletedAt: new Date().toISOString() });
        return value;
      });

      // Deliberately avoid competing with the first request or its playback start.
      const secondReady = (async () => {
        if (!second) second = prepare(await request(split.rest, 2), false);
        assertCurrent();
        this.queuedAudio = second.audio;
        emit({
          ttsAudioByteLength: first!.byteLength + second.byteLength,
          ttsAudioMimeType: first!.mimeType || second.mimeType || "audio/mpeg",
        });
        options.onSpeechReady?.(); // Full two-asset speech is ready, not merely segment 1.
        emit({ segmentedTtsSegment2ReadyBeforeSegment1End: firstEndAt === null });
        return { error: null as unknown };
      })().catch((error: unknown) => ({ error }));

      const [firstEnd, secondResult] = await Promise.all([firstEnded, secondReady]);
      assertCurrent();
      if (secondResult.error) {
        emit({ segmentedTtsFailureReason: "segment2_request_failed" });
        throw secondResult.error;
      }
      if (!second) throw new Error("Second speech segment unavailable");
      const secondPlay = playAsset(second, () => {
        emit({
          segmentedTtsSegment2PlaybackStartedAt: new Date().toISOString(),
          segmentedTtsGapMs: firstEndAt === null ? null : elapsed(firstEndAt),
        });
      }, 2);
      await secondPlay.started;
      const secondEnd = await secondPlay.ended;
      assertCurrent();
      completed = true;
      if (first && second && !pair) {
        pair = [first, second];
        this.cache.set(key, pair);
        ownedByCache = true;
      }
      const completedAt = new Date().toISOString();
      emit({
        segmentedTtsSegment2PlaybackCompletedAt: completedAt,
        segmentedTtsTotalPlaybackCompletedAt: completedAt,
      });
      options.onPlaybackCompleted?.({
        currentTime: firstEnd.currentTime !== null && secondEnd.currentTime !== null
          ? firstEnd.currentTime + secondEnd.currentTime : null,
        duration: firstEnd.duration !== null && secondEnd.duration !== null
          ? firstEnd.duration + secondEnd.duration : null,
      });
    } catch (error) {
      if (!current()) throw abortError();
      if (!firstStarted) {
        emit({ segmentedTtsFallbackUsed: true, segmentedTtsFallbackReason: "segment1_before_playback_failed" });
        throw new FirstSegmentNotStartedError(error);
      }
      emit({ segmentedTtsFailureReason: "segment_after_playback_failed" });
      throw error;
    } finally {
      if (current()) {
        // A media error may finish this method while the other request is still
        // in flight. Invalidate it before any late asset can enter the queue.
        this.operationId += 1;
        this.requestController?.abort();
        this.requestController = null;
        stopAudio(this.activeAudio);
        stopAudio(this.queuedAudio);
        this.activeAudio = null;
        this.queuedAudio = null;
        this.activeCancel = null;
      }
      if (!ownedByCache) {
        if (first) this.dependencies.revokeObjectUrl(first.url);
        if (second) this.dependencies.revokeObjectUrl(second.url);
      }
    }
  }

  pausePlayback() {
    if (!this.activeAudio) return false;
    this.activeAudio.pause();
    return true;
  }

  async resumePlayback() {
    if (!this.activeAudio) throw new Error("No segmented speech audio is paused");
    await this.activeAudio.play();
  }

  stopPlayback() {
    this.operationId += 1;
    this.requestController?.abort();
    this.requestController = null;
    this.activeCancel?.();
    this.activeCancel = null;
    this.activeAudio = null;
    this.queuedAudio = null;
  }

  clearCache() {
    this.stopPlayback();
    for (const pair of this.cache.values()) for (const asset of pair) {
      stopAudio(asset.audio);
      this.dependencies.revokeObjectUrl(asset.url);
    }
    this.cache.clear();
    stopAudio(this.preparedAudio);
    this.preparedAudio = null;
  }

  dispose() {
    if (this.disposed) return;
    this.clearCache();
    this.disposed = true;
  }
}
