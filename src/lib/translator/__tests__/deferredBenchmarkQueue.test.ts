import { describe, expect, it, vi } from "vitest";
import { DeferredBenchmarkQueue } from "@/lib/translator/deferredBenchmarkQueue";

describe("deferred translator benchmark queue", () => {
  it("holds benchmark work during autoplay playback and starts it when flushed", () => {
    const queue = new DeferredBenchmarkQueue();
    const runBenchmark = vi.fn();

    expect(queue.schedule("turn-1", runBenchmark, true)).toBe(true);
    expect(runBenchmark).not.toHaveBeenCalled();
    expect(queue.flush()).toBe(1);
    expect(runBenchmark).toHaveBeenCalledOnce();
  });

  it("starts immediately when TTS is not requested", () => {
    const queue = new DeferredBenchmarkQueue();
    const runBenchmark = vi.fn();

    expect(queue.schedule("turn-1", runBenchmark, false)).toBe(false);
    expect(runBenchmark).toHaveBeenCalledOnce();
    expect(queue.flush()).toBe(0);
  });

  it("keeps the result callback and prevents a turn from being queued twice", () => {
    const queue = new DeferredBenchmarkQueue();
    const onResult = vi.fn();
    const result = { transcript: "grounded benchmark result" };
    const runBenchmark = () => onResult(result);

    expect(queue.schedule("turn-1", runBenchmark, true)).toBe(true);
    expect(queue.schedule("turn-1", runBenchmark, true)).toBe(false);
    expect(queue.flush()).toBe(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(result);
    expect(queue.flush()).toBe(0);
  });
});
