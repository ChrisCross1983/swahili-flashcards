import type { TranslationDiagnostics } from "@/lib/translator/types";

type ClientPerformanceDiagnostics = Pick<
  TranslationDiagnostics,
  | "translationRequestMs"
  | "stopToTranslationVisibleMs"
  | "ttsRequestToReadyMs"
  | "translationVisibleToTtsReadyMs"
  | "stopToTtsReadyMs"
  | "stopToPlaybackStartedMs"
>;

type TurnTimepoints = {
  recordingStopped: number;
  translationRequestStarted?: number;
  translationCompleted?: number;
  translationVisible?: number;
  ttsRequestStarted?: number;
  ttsReady?: number;
  playbackStarted?: number;
};

function validTime(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function duration(start: number | undefined, end: number | undefined) {
  if (
    start === undefined ||
    end === undefined ||
    !validTime(start) ||
    !validTime(end) ||
    end < start
  ) {
    return undefined;
  }
  return Math.round(end - start);
}

export class TranslatorTurnPerformance {
  private readonly timepoints: TurnTimepoints;

  constructor(recordingStopped = performance.now()) {
    this.timepoints = {
      recordingStopped: validTime(recordingStopped) ? recordingStopped : 0,
    };
  }

  markTranslationRequestStarted(now = performance.now()) {
    this.markOnce("translationRequestStarted", now);
  }

  markTranslationCompleted(now = performance.now()) {
    this.markOnce("translationCompleted", now);
  }

  markTranslationVisible(now = performance.now()) {
    this.markOnce("translationVisible", now);
    return this.getDiagnostics();
  }

  markTtsRequestStarted(now = performance.now()) {
    this.markOnce("ttsRequestStarted", now);
  }

  markTtsReady(now = performance.now()) {
    this.markOnce("ttsReady", now);
    return this.getDiagnostics();
  }

  markPlaybackStarted(now = performance.now()) {
    this.markOnce("playbackStarted", now);
    return this.getDiagnostics();
  }

  getDiagnostics(): Partial<ClientPerformanceDiagnostics> {
    const translationRequestMs = duration(
      this.timepoints.translationRequestStarted,
      this.timepoints.translationCompleted,
    );
    const stopToTranslationVisibleMs = duration(
      this.timepoints.recordingStopped,
      this.timepoints.translationVisible,
    );
    const ttsRequestToReadyMs = duration(
      this.timepoints.ttsRequestStarted,
      this.timepoints.ttsReady,
    );
    const translationVisibleToTtsReadyMs = duration(
      this.timepoints.translationVisible,
      this.timepoints.ttsReady,
    );
    const stopToTtsReadyMs = duration(
      this.timepoints.recordingStopped,
      this.timepoints.ttsReady,
    );
    const stopToPlaybackStartedMs = duration(
      this.timepoints.recordingStopped,
      this.timepoints.playbackStarted,
    );

    return {
      ...(translationRequestMs === undefined ? {} : { translationRequestMs }),
      ...(stopToTranslationVisibleMs === undefined
        ? {}
        : { stopToTranslationVisibleMs }),
      ...(ttsRequestToReadyMs === undefined ? {} : { ttsRequestToReadyMs }),
      ...(translationVisibleToTtsReadyMs === undefined
        ? {}
        : { translationVisibleToTtsReadyMs }),
      ...(stopToTtsReadyMs === undefined ? {} : { stopToTtsReadyMs }),
      ...(stopToPlaybackStartedMs === undefined
        ? {}
        : { stopToPlaybackStartedMs }),
    };
  }

  private markOnce(
    name: Exclude<keyof TurnTimepoints, "recordingStopped">,
    value: number,
  ) {
    if (this.timepoints[name] === undefined && validTime(value)) {
      this.timepoints[name] = value;
    }
  }
}
