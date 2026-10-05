import type { TranslationEntry } from "@/lib/translator/types";
import type { TranslatorSpeechGenerationDiagnostics } from "@/lib/translator/speechClient";
import type {
  TranslatorSpeechPlaybackIdentity,
  TranslatorSpeechPlaybackOptions,
  TranslatorSpeechPlaybackPosition,
} from "@/lib/translator/translatorSpeechPlayer";
import {
  ClassicRealtimeSpeechOutputClient,
  type RealtimeSpeechOutputTelemetry,
} from "@/lib/translator/realtimeSpeechOutputClient";

type LegacyPlay = (
  entry: TranslationEntry,
  speed: number,
  options: TranslatorSpeechPlaybackOptions,
) => Promise<void>;

type Dependencies = {
  client?: ClassicRealtimeSpeechOutputClient;
  playLegacy: LegacyPlay;
  isDocumentVisible?: () => boolean;
};

const noPosition: TranslatorSpeechPlaybackPosition = {
  currentTime: null,
  duration: null,
};

/**
 * Adapts the output-only WebRTC transport to the established Classic player
 * callbacks. It never falls back after `audio.play()` succeeded, preventing
 * duplicate audio. The legacy player remains the implementation of fallback.
 */
export class RealtimeSpeechOutputPlayer {
  private readonly client: ClassicRealtimeSpeechOutputClient;
  private activeController: AbortController | null = null;
  private activeAudioStarted = false;
  private activeOptions: TranslatorSpeechPlaybackOptions | null = null;
  private operationId = 0;
  private disposed = false;

  constructor(private readonly dependencies: Dependencies) {
    this.client = dependencies.client ?? new ClassicRealtimeSpeechOutputClient();
  }

  async play(
    entry: TranslationEntry,
    speed: number,
    options: TranslatorSpeechPlaybackOptions = {},
  ) {
    if (this.disposed) throw new Error("Speech player is disposed");
    this.stopPlayback();
    const operationId = this.operationId;
    const controller = new AbortController();
    this.activeController = controller;
    this.activeAudioStarted = false;
    this.activeOptions = options;
    options.onSpeechRequestStarted?.();

    if (options.autoplay && this.dependencies.isDocumentVisible?.() === false) {
      throw new DOMException(
        "Automatic playback requires a visible page",
        "NotAllowedError",
      );
    }

    const updateTelemetry = (telemetry: Partial<RealtimeSpeechOutputTelemetry>) => {
      if (operationId !== this.operationId || this.disposed) return;
      options.onSpeechDiagnosticsUpdated?.(telemetry);
    };

    try {
      await this.client.render(entry.translatedText, entry.targetLanguage, controller.signal, {
        onTelemetry: updateTelemetry,
        onFirstAudio: (telemetry) => {
          if (operationId !== this.operationId || this.disposed) return;
          const diagnostics: TranslatorSpeechGenerationDiagnostics = {
            ...telemetry,
            ttsGenerationMs: 0,
            ttsStreamingUsed: true,
            ttsInputTextLength: entry.translatedText.length,
            ttsAudioMimeType: null,
            ttsRealtimeFallbackUsed: false,
            ttsRealtimeFallbackReason: null,
          };
          options.onSpeechGenerated?.(diagnostics);
          options.onAudioPreparationStarted?.();
          options.onAudioPreparationCompleted?.();
          options.onSpeechReady?.();
        },
        onPlaybackAttempt: () => {
          if (operationId !== this.operationId || this.disposed) return;
          options.onPlaybackAttempt?.({
            generationId: `realtime-webrtc-${operationId}`,
            playbackAttemptId: `realtime-webrtc-playback-${operationId}`,
            fromCache: false,
          } satisfies TranslatorSpeechPlaybackIdentity);
          options.onPlayRequested?.();
        },
        onPlaybackStarted: () => {
          if (operationId !== this.operationId || this.disposed) return;
          this.activeAudioStarted = true;
          options.onPlaybackStarted?.();
        },
        onPlaybackCompleted: () => {
          if (operationId !== this.operationId || this.disposed) return;
          this.activeAudioStarted = false;
          options.onPlaybackCompleted?.(noPosition);
        },
      });
    } catch (error) {
      const current = operationId === this.operationId && !this.disposed;
      if (current && !controller.signal.aborted && !this.activeAudioStarted) {
        const reason = error instanceof Error ? error.message : "realtime_speech_unknown_error";
        updateTelemetry({
          ttsRealtimeFallbackUsed: true,
          ttsRealtimeFallbackReason: reason,
          ttsRealtimeFallbackStartedAt: new Date().toISOString(),
        });
        return this.dependencies.playLegacy(entry, speed, options);
      }
      throw error;
    } finally {
      if (this.activeController === controller) this.activeController = null;
      if (operationId === this.operationId) this.activeOptions = null;
    }
  }

  pausePlayback() {
    // WebRTC remote streams are intentionally interrupted rather than paused;
    // resume would require a new response and could duplicate speech.
    return false;
  }

  async resumePlayback() {
    throw new Error("Realtime speech output cannot be resumed");
  }

  stopPlayback() {
    this.operationId += 1;
    const wasPlaying = this.activeAudioStarted;
    this.activeAudioStarted = false;
    if (wasPlaying) this.activeOptions?.onPlaybackInterrupted?.(noPosition);
    this.activeController?.abort();
    this.activeController = null;
    this.client.stop();
    this.activeOptions = null;
  }

  dispose() {
    if (this.disposed) return;
    this.stopPlayback();
    this.disposed = true;
  }

  hasCachedAudio() {
    return false;
  }

  clearCache() {
    this.stopPlayback();
  }

  prepareForUserGesture() {
    // The remote MediaStream does not exist until a session emits a track.
  }
}
