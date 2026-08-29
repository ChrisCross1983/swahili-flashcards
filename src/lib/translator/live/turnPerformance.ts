import type { LiveLanguage, LiveTurnPerformance } from "./types";

type Mark =
  | "turnStart"
  | "turnEnd"
  | "translationFirstDelta"
  | "audioFirstOutput"
  | "selectedAudioReady"
  | "playbackStarted"
  | "translationCompleted"
  | "audioCompleted";

export class LiveTurnPerformanceTracker {
  private marks = new Map<Mark, number>();

  constructor(private readonly now: () => number = () => performance.now()) {}

  mark(name: Mark, at = this.now()) {
    if (!this.marks.has(name)) this.marks.set(name, at);
  }

  result(sourceLanguage: LiveLanguage, targetLanguage: LiveLanguage): LiveTurnPerformance {
    const duration = (from: Mark, to: Mark) => {
      const start = this.marks.get(from);
      const end = this.marks.get(to);
      return start == null || end == null ? null : Math.max(0, Math.round(end - start));
    };
    const signedDuration = (from: Mark, to: Mark) => {
      const start = this.marks.get(from);
      const end = this.marks.get(to);
      if (start == null || end == null) return null;
      const value = Math.round(end - start);
      return Object.is(value, -0) ? 0 : value;
    };

    return {
      sourceLanguage,
      targetLanguage,
      speechEndToFirstTranslationMs: duration("turnEnd", "translationFirstDelta"),
      speechEndToFirstAudioMs: duration("turnEnd", "audioFirstOutput"),
      speechEndToTranslationCompleteMs: duration("turnEnd", "translationCompleted"),
      speechEndToAudioCompleteMs: duration("turnEnd", "audioCompleted"),
      speechStartToFirstTranslationMs: duration("turnStart", "translationFirstDelta"),
      speechStartToFirstAudioMs: duration("turnStart", "audioFirstOutput"),
      speechEndToPlaybackStartedMs: duration("turnEnd", "playbackStarted"),
      firstTranslationRelativeToSpeechEndMs:
        signedDuration("turnEnd", "translationFirstDelta"),
      firstAudioRelativeToSpeechEndMs: signedDuration("turnEnd", "audioFirstOutput"),
    };
  }
}

export function logLiveTurnPerformance(value: LiveTurnPerformance) {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[translator-live][turn performance]", value);
  }
}
