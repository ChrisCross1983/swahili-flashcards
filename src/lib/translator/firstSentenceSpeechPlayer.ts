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

type Asset = { url: string; byteLength: number; mimeType: string };
type Pair = [Asset, Asset];
type CachedSpeech = { pair: Pair; audio: SegmentAudio };

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

function clearAudioHandlers(audio: SegmentAudio | null) {
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  audio.onloadstart = null;
  audio.oncanplay = null;
  audio.onplaying = null;
}

function stopAudio(audio: SegmentAudio | null) {
  if (!audio) return;
  clearAudioHandlers(audio);
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

/** One logical playback operation, two full MP3 assets, one audio element. */
export class FirstSentenceSpeechPlayer {
  private readonly cache = new Map<string, CachedSpeech>();
  private operationId = 0;
  private readonly requestControllers = new Set<AbortController>();
  private activeAudio: SegmentAudio | null = null;
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
    const cached = this.cache.get(key);
    let pair = cached?.pair;
    let ownedByCache = fromCache;
    let first: Asset | null = pair?.[0] ?? null;
    let second: Asset | null = pair?.[1] ?? null;
    let audio: SegmentAudio | null = cached?.audio ?? null;
    let activeSegment: 1 | 2 | null = null;
    let firstStarted = false;
    let firstEndAt: number | null = null;
    let firstDuration: number | null = null;
    let completed = false;
    let fullReadyEmitted = false;
    let secondRequestError: unknown = null;
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
          (activeSegment === 2 && firstDuration !== null
            ? firstDuration + activePosition.currentTime : activePosition.currentTime),
        duration: firstDuration !== null && activeSegment === 2 && audio && Number.isFinite(audio.duration)
          ? firstDuration + audio.duration : activePosition.duration,
      });
      stopAudio(audio);
      for (const wait of pending) wait.reject(abortError());
      pending.clear();
    };
    this.activeCancel = cancel;
    emit({
      segmentedTtsEligible: true, segmentedTtsUsed: true, segmentedTtsSegmentCount: 2,
      segmentedTtsSegment1TextLength: split.first.length,
      segmentedTtsSegment2TextLength: split.rest.length,
      segmentedTtsSharedAudioElement: true,
      segmentedTtsFallbackUsed: false,
      segmentedTtsFallbackReason: null,
      segmentedTtsFailureReason: null,
      segmentedTtsGapMs: null,
    });

    const request = async (text: string, number: 1 | 2) => {
      const controller = new AbortController();
      this.requestControllers.add(controller);
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
        this.requestControllers.delete(controller);
      }
    };
    const prepareAsset = (asset: TranslatorSpeechAsset): Asset => {
      assertCurrent();
      const url = this.dependencies.createObjectUrl(asset.audio);
      return { url, byteLength: asset.audio.size, mimeType: asset.audio.type };
    };
    const reportFullReady = () => {
      if (!first || !second || fullReadyEmitted) return;
      fullReadyEmitted = true;
      emit({
        ttsAudioByteLength: first.byteLength + second.byteLength,
        ttsAudioMimeType: first.mimeType || second.mimeType || "audio/mpeg",
      });
      options.onSpeechReady?.(); // Both complete assets, never just segment 1.
    };
    const setSource = (element: SegmentAudio, asset: Asset, segment: 1 | 2) => {
      if (segment === 2) {
        element.onloadstart = () => {
          if (current()) emit({ segmentedTtsSegment2LoadStartAt: new Date().toISOString() });
        };
        element.oncanplay = () => {
          if (current()) emit({ segmentedTtsSegment2CanPlayAt: new Date().toISOString(), ...secondAudioState(element) });
        };
        element.onerror = () => {
          if (current()) emit({ segmentedTtsSegment2ErrorAt: new Date().toISOString(), ...secondAudioState(element) });
        };
      }
      element.preload = "auto";
      element.src = asset.url;
      element.load();
    };
    const playAsset = (element: SegmentAudio, onStart: () => void, segment: 1 | 2) => {
      const started = deferred<void>();
      const ended = deferred<TranslatorSpeechPlaybackPosition>();
      pending.add(started as Deferred<unknown>);
      pending.add(ended as Deferred<unknown>);
      this.activeAudio = element;
      activeSegment = segment;
      if (segment === 2) {
        element.onplaying = () => {
          if (current()) emit({ segmentedTtsSegment2PlayingAt: new Date().toISOString(), ...secondAudioState(element) });
        };
      }
      element.onended = () => {
        if (!current()) return;
        if (segment === 2) emit({ segmentedTtsSegment2EndedAt: new Date().toISOString(), ...secondAudioState(element) });
        const atEnd = position(element);
        if (segment === 2) stopAudio(element);
        else clearAudioHandlers(element);
        if (this.activeAudio === element) this.activeAudio = null;
        activeSegment = null;
        pending.delete(ended as Deferred<unknown>);
        ended.resolve(atEnd);
      };
      element.onerror = () => {
        if (!current()) return;
        if (segment === 2) emit({ segmentedTtsSegment2ErrorAt: new Date().toISOString(), ...secondAudioState(element) });
        const error = new Error("Segmented speech audio could not be played");
        started.reject(error);
        ended.reject(error);
      };
      const rejectPlay = (error: unknown) => {
        if (segment === 2 && current()) emit({
          segmentedTtsSegment2PlayRejectedAt: new Date().toISOString(),
          ...secondPlayError(error), ...secondAudioState(element),
        });
        started.reject(error);
        ended.reject(error);
      };
      try {
        if (segment === 2) emit({ segmentedTtsSegment2PlayInvokedAt: new Date().toISOString(), ...secondAudioState(element) });
        void element.play().then(() => {
          if (!current()) { started.reject(abortError()); ended.reject(abortError()); return; }
          if (segment === 2) emit({ segmentedTtsSegment2PlayResolvedAt: new Date().toISOString(), ...secondAudioState(element) });
          pending.delete(started as Deferred<unknown>);
          onStart();
          started.resolve();
        }, rejectPlay);
      } catch (error) { rejectPlay(error); }
      return { started: started.promise, ended: ended.promise };
    };

    try {
      // Issue segment 1 first, then begin segment 2 while it is still being
      // generated. Only the first asset is ever attached to the audio element.
      const firstRequest = first ? null : request(split.first, 1);
      const secondReady = (async () => {
        if (!second) second = prepareAsset(await request(split.rest, 2));
        assertCurrent();
        reportFullReady();
        emit({ segmentedTtsSegment2ReadyBeforeSegment1End: firstEndAt === null });
        return { error: null as unknown };
      })().catch((error: unknown) => {
        secondRequestError = error;
        return { error };
      });
      if (firstRequest) {
        const firstAsset = await firstRequest;
        options.onAudioPreparationStarted?.();
        first = prepareAsset(firstAsset);
        reportFullReady();
      }
      if (secondRequestError) throw secondRequestError;
      if (!first) throw new Error("First speech segment unavailable");
      if (!audio) {
        audio = this.preparedAudio ?? this.dependencies.createAudio();
        this.preparedAudio = null;
      }
      setSource(audio, first, 1);
      if (!fromCache) {
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
      const firstPlay = playAsset(audio, () => {
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

      const [firstEnd, secondResult] = await Promise.all([firstEnded, secondReady]);
      assertCurrent();
      if (secondResult.error) {
        emit({ segmentedTtsFailureReason: "segment2_request_failed" });
        throw secondResult.error;
      }
      if (!second) throw new Error("Second speech segment unavailable");
      setSource(audio, second, 2);
      const secondPlay = playAsset(audio, () => {
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
        this.cache.set(key, { pair, audio });
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
        for (const controller of this.requestControllers) controller.abort();
        this.requestControllers.clear();
        stopAudio(audio);
        this.activeAudio = null;
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
    for (const controller of this.requestControllers) controller.abort();
    this.requestControllers.clear();
    this.activeCancel?.();
    this.activeCancel = null;
    this.activeAudio = null;
  }

  clearCache() {
    this.stopPlayback();
    for (const cached of this.cache.values()) {
      stopAudio(cached.audio);
      for (const asset of cached.pair) this.dependencies.revokeObjectUrl(asset.url);
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
