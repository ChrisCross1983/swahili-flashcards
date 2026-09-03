import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslatorAudioQualityMonitor } from "@/lib/translator/audioQuality";

describe("passive translator audio quality monitor", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns finite PCM-derived metrics in documented ranges", () => {
    vi.useFakeTimers();
    class FakeAudioContext {
      sampleRate = 48_000;
      createAnalyser() {
        return {
          fftSize: 0,
          getFloatTimeDomainData(buffer: Float32Array) {
            for (let index = 0; index < buffer.length; index += 1) {
              buffer[index] = index % 4 === 0 ? 1 : index % 4 === 1 ? 0.5 : 0.001;
            }
          },
        };
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      close() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const stream = {
      getAudioTracks: () => [{ getSettings: () => ({ sampleRate: 48_000, channelCount: 1 }) }],
    } as unknown as MediaStream;
    const monitor = new TranslatorAudioQualityMonitor();
    expect(monitor.start(stream)).toBe(true);
    vi.advanceTimersByTime(200);
    const result = monitor.stop();
    expect(result.metadata).toEqual({ sampleRate: 48_000, channelCount: 1 });
    expect(result.metrics.source).toBe("realtime_analyser");
    for (const metric of [
      result.metrics.rmsDbfs, result.metrics.peakDbfs,
      result.metrics.clippingRatio, result.metrics.silenceRatio,
      result.metrics.speechActivityRatio,
    ]) {
      expect(metric).not.toBeNull();
      expect(Number.isFinite(metric)).toBe(true);
    }
    expect(result.metrics.clippingRatio).toBeGreaterThanOrEqual(0);
    expect(result.metrics.clippingRatio).toBeLessThanOrEqual(1);
    expect(result.metrics.silenceRatio).toBeGreaterThanOrEqual(0);
    expect(result.metrics.silenceRatio).toBeLessThanOrEqual(1);
    expect(result.metrics.speechActivityRatio).toBeGreaterThanOrEqual(0);
    expect(result.metrics.speechActivityRatio).toBeLessThanOrEqual(1);
  });

  it("fails open with unavailable metrics when Web Audio initialization fails", () => {
    class BrokenAudioContext {
      constructor() {
        throw new Error("unsupported");
      }
    }
    vi.stubGlobal("window", { AudioContext: BrokenAudioContext });
    const monitor = new TranslatorAudioQualityMonitor();
    expect(monitor.start({} as MediaStream)).toBe(false);
    expect(monitor.stop().metrics).toEqual({
      source: "unavailable", rmsDbfs: null, peakDbfs: null,
      clippingRatio: null, silenceRatio: null, speechActivityRatio: null,
    });
  });
});
