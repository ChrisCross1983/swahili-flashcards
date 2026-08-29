import { describe, expect, it, vi } from "vitest";
import { LiveTurnPerformanceTracker, logLiveTurnPerformance } from "../turnPerformance";

describe("live turn performance", () => {
  it("uses one monotonic clock for all durations", () => {
    let now = 100;
    const tracker = new LiveTurnPerformanceTracker(() => now);
    tracker.mark("turnStart");
    now = 900;
    tracker.mark("translationFirstDelta");
    now = 1_000;
    tracker.mark("turnEnd");
    now = 1_100;
    tracker.mark("audioFirstOutput");
    now = 1_300;
    tracker.mark("translationCompleted");
    now = 1_600;
    tracker.mark("audioCompleted");

    expect(tracker.result("de", "sw")).toEqual({
      sourceLanguage: "de",
      targetLanguage: "sw",
      speechEndToFirstTranslationMs: 0,
      speechEndToFirstAudioMs: 100,
      speechEndToTranslationCompleteMs: 300,
      speechEndToAudioCompleteMs: 600,
      speechStartToFirstTranslationMs: 800,
      speechStartToFirstAudioMs: 1_000,
      speechEndToPlaybackStartedMs: null,
      firstTranslationRelativeToSpeechEndMs: -100,
      firstAudioRelativeToSpeechEndMs: 100,
    });
  });

  it("never logs conversation content", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    logLiveTurnPerformance({
      sourceLanguage: "sw",
      targetLanguage: "de",
      speechEndToFirstTranslationMs: 1,
      speechEndToFirstAudioMs: 2,
      speechEndToTranslationCompleteMs: 3,
      speechEndToAudioCompleteMs: 4,
      speechStartToFirstTranslationMs: 5,
      speechStartToFirstAudioMs: 6,
      speechEndToPlaybackStartedMs: 7,
      firstTranslationRelativeToSpeechEndMs: -8,
      firstAudioRelativeToSpeechEndMs: -9,
    });
    expect(JSON.stringify(debug.mock.calls)).not.toContain("Habari");
    debug.mockRestore();
  });
});
