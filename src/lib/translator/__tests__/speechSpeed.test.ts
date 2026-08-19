import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPEECH_SPEED,
  formatSpeechSpeed,
  getSpeechCacheKey,
  isValidSpeechSpeed,
} from "@/lib/translator/speechSpeed";

describe("translator speech speed", () => {
  it("defaults to normal 1.0x speech", () => {
    expect(DEFAULT_SPEECH_SPEED).toBe(1);
    expect(formatSpeechSpeed(DEFAULT_SPEECH_SPEED)).toBe("1.0");
  });

  it("accepts only the product range from 0.8 to 1.2", () => {
    expect(isValidSpeechSpeed(0.8)).toBe(true);
    expect(isValidSpeechSpeed(1)).toBe(true);
    expect(isValidSpeechSpeed(1.2)).toBe(true);
    expect(isValidSpeechSpeed(0.79)).toBe(false);
    expect(isValidSpeechSpeed(1.21)).toBe(false);
    expect(isValidSpeechSpeed(Number.NaN)).toBe(false);
    expect(isValidSpeechSpeed("1")).toBe(false);
  });

  it("uses speed as part of the local audio cache key", () => {
    expect(getSpeechCacheKey("entry-1", 1)).toBe("entry-1:1.00");
    expect(getSpeechCacheKey("entry-1", 1.15)).toBe("entry-1:1.15");
  });
});
