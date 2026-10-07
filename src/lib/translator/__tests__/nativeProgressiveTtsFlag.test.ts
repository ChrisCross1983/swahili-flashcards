import { describe, expect, it } from "vitest";
import {
  NATIVE_PROGRESSIVE_TTS_SPIKE_BRANCH,
  nativeProgressiveTtsPreviewEnabled,
} from "@/lib/translator/nativeProgressiveTtsFlag";

describe("native progressive TTS preview gate", () => {
  it("opens only on the named preview branch", () => {
    expect(nativeProgressiveTtsPreviewEnabled({
      vercelEnvironment: "preview", branch: NATIVE_PROGRESSIVE_TTS_SPIKE_BRANCH,
    })).toBe(true);
    for (const vercelEnvironment of ["production", "development", undefined]) {
      expect(nativeProgressiveTtsPreviewEnabled({
        vercelEnvironment, branch: NATIVE_PROGRESSIVE_TTS_SPIKE_BRANCH,
      })).toBe(false);
    }
    expect(nativeProgressiveTtsPreviewEnabled({
      vercelEnvironment: "preview", branch: "main",
    })).toBe(false);
  });
});
