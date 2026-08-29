import { describe, expect, it } from "vitest";
import { LIVE_TURN_SILENCE_MS } from "../config";
import { shouldDiscardNoiseTurn, shouldFinishLiveTurn } from "../turnDetection";

describe("live turn detection", () => {
  it("uses a centrally configured 1000-ms silence default", () => {
    expect(LIVE_TURN_SILENCE_MS).toBe(1_000);
  });

  it("does not finish on a natural pause below the threshold", () => {
    expect(shouldFinishLiveTurn(500, 999)).toBe(false);
  });

  it("finishes real speech at the configured silence threshold", () => {
    expect(shouldFinishLiveTurn(500, 1_000)).toBe(true);
  });

  it("discards short noise instead of treating it as speech", () => {
    expect(shouldDiscardNoiseTurn(200, 1_000)).toBe(true);
    expect(shouldFinishLiveTurn(200, 1_000)).toBe(false);
  });
});
