import type { TranslationEntry } from "@/lib/translator/types";
import { getSpeechCacheKey } from "@/lib/translator/speechSpeed";
import {
  getSpeechErrorName,
  isSpeechPlaybackBlockedError,
} from "@/lib/translator/speechClient";

type AudioElement = Pick<
  HTMLAudioElement,
  "currentTime" | "onended" | "onerror" | "pause" | "play" | "preload"
>;

export type TranslatorSpeechPlayerDependencies = {
  requestSpeech: (
    entry: TranslationEntry,
    speed: number,
    signal: AbortSignal,
  ) => Promise<Blob>;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  createAudio: (url: string) => AudioElement;
};

export type TranslatorSpeechPlaybackOptions = {
  autoplay?: boolean;
  onPlaybackStarted?: () => void;
};

function createAbortError() {
  return new DOMException("Speech playback was stopped", "AbortError");
}

function resetAudio(audio: AudioElement) {
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // Some browsers reject seeking before media metadata is available.
  }
}

function logPlaybackFailure(error: unknown, autoplay: boolean) {
  if (process.env.NODE_ENV !== "development") return;
  const metadata = { name: getSpeechErrorName(error), autoplay };
  if (isSpeechPlaybackBlockedError(error)) {
    console.info("[translator][speech playback blocked]", metadata);
    return;
  }
  console.error("[translator][speech playback error]", metadata);
}

export class TranslatorSpeechPlayer {
  private readonly cache = new Map<string, string>();
  private activeStop: (() => void) | null = null;
  private activeFail: ((error: unknown) => void) | null = null;
  private activeAudio: AudioElement | null = null;
  private requestController: AbortController | null = null;
  private operationId = 0;
  private disposed = false;

  constructor(private readonly dependencies: TranslatorSpeechPlayerDependencies) {}

  hasCachedAudio(entryId: string, speed: number) {
    return this.cache.has(getSpeechCacheKey(entryId, speed));
  }

  async play(
    entry: TranslationEntry,
    speed: number,
    options: TranslatorSpeechPlaybackOptions = {},
  ) {
    if (this.disposed) throw new Error("Speech player is disposed");

    this.stopPlayback();
    const operationId = this.operationId;
    const cacheKey = getSpeechCacheKey(entry.id, speed);
    let objectUrl = this.cache.get(cacheKey);

    if (!objectUrl) {
      const requestController = new AbortController();
      this.requestController = requestController;
      let audioBlob: Blob;
      try {
        audioBlob = await this.dependencies.requestSpeech(
          entry,
          speed,
          requestController.signal,
        );
      } finally {
        if (this.requestController === requestController) {
          this.requestController = null;
        }
      }

      if (operationId !== this.operationId || this.disposed) {
        throw createAbortError();
      }
      objectUrl = this.dependencies.createObjectUrl(audioBlob);
      this.cache.set(cacheKey, objectUrl);
    }

    if (operationId !== this.operationId || this.disposed) {
      throw createAbortError();
    }

    const audio = this.dependencies.createAudio(objectUrl);
    audio.preload = "auto";
    const playbackRequestedAt = performance.now();

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        if (this.activeStop === stop) this.activeStop = null;
        if (this.activeAudio === audio) this.activeAudio = null;
        if (this.activeFail === failPlayback) this.activeFail = null;
        if (error) reject(error);
        else resolve();
      };

      const failPlayback = (error: unknown) => {
        if (settled) return;
        logPlaybackFailure(error, options.autoplay === true);
        finish(error);
      };

      const stop = () => {
        resetAudio(audio);
        finish();
      };

      this.activeStop = stop;
      this.activeFail = failPlayback;
      this.activeAudio = audio;
      audio.onended = () => finish();
      audio.onerror = () =>
        failPlayback(new Error("The browser could not play the speech audio"));

      void audio.play().then(
        () => {
          if (operationId !== this.operationId || this.disposed) {
            stop();
            return;
          }
          if (process.env.NODE_ENV === "development") {
            console.info("[translator] playback timing", {
              playbackStartMs: Math.round(performance.now() - playbackRequestedAt),
            });
          }
          options.onPlaybackStarted?.();
        },
        (error) => failPlayback(error),
      );
    });
  }

  pausePlayback() {
    if (!this.activeAudio) return false;
    this.activeAudio.pause();
    return true;
  }

  async resumePlayback() {
    const audio = this.activeAudio;
    if (!audio) throw new Error("No speech audio is paused");
    const operationId = this.operationId;
    const playbackRequestedAt = performance.now();

    try {
      await audio.play();
      if (operationId !== this.operationId || this.disposed) {
        resetAudio(audio);
        return;
      }
      if (process.env.NODE_ENV === "development") {
        console.info("[translator] playback timing", {
          playbackStartMs: Math.round(performance.now() - playbackRequestedAt),
        });
      }
    } catch (error) {
      this.activeFail?.(error);
      throw error;
    }
  }

  stopPlayback() {
    this.operationId += 1;
    this.requestController?.abort();
    this.requestController = null;
    this.activeStop?.();
    this.activeStop = null;
    this.activeFail = null;
    this.activeAudio = null;
  }

  clearCache() {
    this.stopPlayback();
    for (const objectUrl of this.cache.values()) {
      this.dependencies.revokeObjectUrl(objectUrl);
    }
    this.cache.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.clearCache();
    this.disposed = true;
  }
}
