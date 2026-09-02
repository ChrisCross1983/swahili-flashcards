import { describe, expect, it, vi } from "vitest";
import {
  otherPreOpenAiTiming,
  roundedServerTiming,
  ServerStageTimings,
} from "@/lib/translator/server/preOpenAiTimings";

describe("server pre-OpenAI timings", () => {
  it("uses monotonic stage durations and preserves null semantics", () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(25);
    const timings = new ServerStageTimings<"auth" | "schema">();

    expect(timings.start("auth")).toEqual(expect.any(String));
    expect(timings.complete("auth")).toEqual(expect.any(String));
    expect(timings.duration("auth")).toBe(15);
    expect(timings.duration("schema")).toBeNull();
    expect(timings.startedAt("schema")).toBeNull();
    expect(timings.completedAt("schema")).toBeNull();
  });

  it("derives other time from non-overlapping measured stages", () => {
    expect(otherPreOpenAiTiming(100, [15, null, 20])).toBe(65);
    expect(otherPreOpenAiTiming(null, [15])).toBeNull();
    expect(otherPreOpenAiTiming(10, [20])).toBe(0);
    expect(roundedServerTiming(1.6)).toBe(2);
    expect(roundedServerTiming(null)).toBeNull();
  });
});
