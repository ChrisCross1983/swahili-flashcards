import { describe, expect, it } from "vitest";
import {
  learningSignalQuality,
  transcriptScriptAnomalyDetected,
} from "@/lib/translator/sttRouting";

describe("STT learning foundations", () => {
  it("records only a conservative diagnostic script anomaly", () => {
    expect(transcriptScriptAnomalyDetected("Ni bei gani?")).toBe(false);
    expect(transcriptScriptAnomalyDetected("Wie viel kostet es?")).toBe(false);
    expect(transcriptScriptAnomalyDetected("你好世界测试")).toBe(true);
    expect(transcriptScriptAnomalyDetected("Hi你")).toBe(false);
  });

  it("requires same audio, review, and retained audio for a high-quality signal", () => {
    expect(learningSignalQuality({
      sameAudioComparisonAvailable: false,
      reviewStatus: "accepted",
      audioAvailable: true,
    })).toBe("low");
    expect(learningSignalQuality({
      sameAudioComparisonAvailable: true,
      reviewStatus: "unreviewed",
      audioAvailable: true,
    })).toBe("medium");
    expect(learningSignalQuality({
      sameAudioComparisonAvailable: true,
      reviewStatus: "corrected",
      audioAvailable: true,
    })).toBe("high");
  });
});
