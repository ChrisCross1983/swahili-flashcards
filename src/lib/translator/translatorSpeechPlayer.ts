import type { TranslationDiagnostics, TranslationEntry } from "@/lib/translator/types";
import { getSpeechCacheKey } from "@/lib/translator/speechSpeed";
import {
  getSpeechErrorName,
  isSpeechPlaybackBlockedError,
  type TranslatorSpeechAsset,
  type TranslatorSpeechGenerationDiagnostics,
} from "@/lib/translator/speechClient";

type AudioElement = Pick<
  HTMLAudioElement,
  | "currentTime"
  | "duration"
  | "load"
  | "onended"
  | "onerror"
  | "pause"
  | "play"
  | "preload"
  | "src"
>;

type CachedSpeech = {
  objectUrl: string;
  audio: AudioElement;
  generationId: string;
};

export type TranslatorSpeechPlaybackIdentity = {
  generationId: string;
  playbackAttemptId: string;
  fromCache: boolean;
};

export type TranslatorSpeechPlaybackPosition = {
  currentTime: number | null;
  duration: number | null;
};

export type TranslatorSpeechPlayerDependencies = {
  requestSpeech: (
    entry: TranslationEntry,
    speed: number,
    signal: AbortSignal,
  ) => Promise<TranslatorSpeechAsset>;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  createAudio: (url?: string) => AudioElement;
  isDocumentVisible?: () => boolean;
};

export type TranslatorSpeechPlaybackOptions = {
  autoplay?: boolean;
  onSpeechGenerated?: (
    diagnostics: TranslatorSpeechGenerationDiagnostics,
  ) => void;
  onSpeechDiagnosticsUpdated?: (
    diagnostics: Partial<TranslatorSpeechGenerationDiagnostics>,
  ) => void;
  onSpeechRequestStarted?: () => void;
  onAudioPreparationStarted?: () => void;
  onAudioPreparationCompleted?: () => void;
  onSpeechReady?: () => void;
  onPlayRequested?: () => void;
  onPlaybackAttempt?: (identity: TranslatorSpeechPlaybackIdentity) => void;
  onPlaybackStarted?: () => void;
  onPlaybackCompleted?: (position: TranslatorSpeechPlaybackPosition) => void;
  onPlaybackInterrupted?: (position: TranslatorSpeechPlaybackPosition) => void;
  onSegmentedDiagnostics?: (diagnostics: Partial<TranslationDiagnostics>) => void;
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

function finiteAudioPosition(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function playbackPosition(audio: AudioElement): TranslatorSpeechPlaybackPosition {
  return {
    currentTime: finiteAudioPosition(audio.currentTime),
    duration: finiteAudioPosition(audio.duration),
  };
}

function logPlaybackFailure(error: unknown, autoplay: boolean) {
  if (process.env.NODE_ENV !== "development") return;
  const metadata = { name: getSpeechErrorName(error), autoplay };
  if (isSpeechPlaybackBlockedError(error)) {
    console.info(
      `[translator][speech playback blocked] ${JSON.stringify(metadata)}`,
    );
    return;
  }
  console.error(
    `[translator][speech playback error] ${JSON.stringify(metadata)}`,
  );
}

export class TranslatorSpeechPlayer {
  private readonly cache = new Map<string, CachedSpeech>();
  private activeStop: (() => void) | null = null;
  private activeFail: ((error: unknown) => void) | null = null;
  private activeAudio: AudioElement | null = null;
  private requestController: AbortController | null = null;
  private preparedAudio: AudioElement | null = null;
  private operationId = 0;
  private disposed = false;

  constructor(private readonly dependencies: TranslatorSpeechPlayerDependencies) {}

  hasCachedAudio(entryId: string, speed: number) {
    return this.cache.has(getSpeechCacheKey(entryId, speed));
  }

  prepareForUserGesture() {
    if (this.disposed || this.preparedAudio) return;
    const audio = this.dependencies.createAudio();
    audio.preload = "auto";
    this.preparedAudio = audio;
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
    let cachedSpeech = this.cache.get(cacheKey);
    const fromCache = cachedSpeech !== undefined;

    if (!cachedSpeech) {
      const requestController = new AbortController();
      this.requestController = requestController;
      let speechAsset: TranslatorSpeechAsset;
      options.onSpeechRequestStarted?.();
      try {
        speechAsset = await this.dependencies.requestSpeech(
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
      options.onSpeechGenerated?.(speechAsset.diagnostics);
      if (speechAsset.serverDiagnostics) {
        void speechAsset.serverDiagnostics.then((diagnostics) => {
          if (diagnostics && operationId === this.operationId && !this.disposed) {
            options.onSpeechDiagnosticsUpdated?.(diagnostics);
          }
        });
      }
      options.onAudioPreparationStarted?.();
      const objectUrl = this.dependencies.createObjectUrl(speechAsset.audio);
      const audio = this.preparedAudio ?? this.dependencies.createAudio();
      this.preparedAudio = null;
      audio.preload = "auto";
      audio.src = objectUrl;
      audio.load();
      cachedSpeech = {
        objectUrl,
        audio,
        generationId: `tts-generation-${operationId}`,
      };
      this.cache.set(cacheKey, cachedSpeech);
      options.onAudioPreparationCompleted?.();
    }

    if (operationId !== this.operationId || this.disposed) {
      throw createAbortError();
    }

    options.onSpeechReady?.();
    if (
      options.autoplay === true &&
      this.dependencies.isDocumentVisible?.() === false
    ) {
      throw new DOMException(
        "Automatic playback requires a visible page",
        "NotAllowedError",
      );
    }

    const audio = cachedSpeech.audio;
    const playbackIdentity: TranslatorSpeechPlaybackIdentity = {
      generationId: cachedSpeech.generationId,
      playbackAttemptId: `tts-playback-${operationId}`,
      fromCache,
    };
    const playbackRequestedAt = performance.now();
    options.onPlaybackAttempt?.(playbackIdentity);
    options.onPlayRequested?.();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let naturalEnd = false;

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
        resetAudio(audio);
        logPlaybackFailure(error, options.autoplay === true);
        finish(error);
      };

      const stop = () => {
        if (settled) return;
        if (!naturalEnd) options.onPlaybackInterrupted?.(playbackPosition(audio));
        resetAudio(audio);
        finish();
      };

      this.activeStop = stop;
      this.activeFail = failPlayback;
      this.activeAudio = audio;
      audio.onended = () => {
        if (operationId !== this.operationId || this.disposed || settled) return;
        naturalEnd = true;
        options.onPlaybackCompleted?.(playbackPosition(audio));
        resetAudio(audio);
        finish();
      };
      audio.onerror = () => {
        if (operationId !== this.operationId || this.disposed || settled) return;
        failPlayback(new Error("The browser could not play the speech audio"));
      };

      try {
        void audio.play().then(
          () => {
            if (operationId !== this.operationId || this.disposed) {
              stop();
              return;
            }
            if (process.env.NODE_ENV === "development") {
              console.info(`[translator] playback timing ${JSON.stringify({
                playbackStartMs: Math.round(
                  performance.now() - playbackRequestedAt,
                ),
              })}`);
            }
            options.onPlaybackStarted?.();
          },
          (error) => failPlayback(error),
        );
      } catch (error) {
        failPlayback(error);
      }
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
        console.info(`[translator] playback timing ${JSON.stringify({
          playbackStartMs: Math.round(performance.now() - playbackRequestedAt),
        })}`);
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
    for (const cachedSpeech of this.cache.values()) {
      resetAudio(cachedSpeech.audio);
      this.dependencies.revokeObjectUrl(cachedSpeech.objectUrl);
    }
    this.cache.clear();
    if (this.preparedAudio) resetAudio(this.preparedAudio);
    this.preparedAudio = null;
  }

  dispose() {
    if (this.disposed) return;
    this.clearCache();
    this.disposed = true;
  }
}
