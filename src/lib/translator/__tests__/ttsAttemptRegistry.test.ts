import { describe, expect, it } from "vitest";
import { TranslatorTtsAttemptRegistry } from "@/lib/translator/ttsAttemptRegistry";

describe("TranslatorTtsAttemptRegistry", () => {
  it("allows exactly one autoplay claim per translation turn", () => {
    const registry = new TranslatorTtsAttemptRegistry();
    expect(registry.claimAutoplay("turn-1")).toBe(true);
    expect(registry.claimAutoplay("turn-1")).toBe(false);
    expect(registry.claimAutoplay("turn-2")).toBe(true);
  });

  it("allows an explicit release when an operation could not start", () => {
    const registry = new TranslatorTtsAttemptRegistry();
    expect(registry.claimAutoplay("turn-1")).toBe(true);
    registry.releaseAutoplay("turn-1");
    expect(registry.claimAutoplay("turn-1")).toBe(true);
  });

  it("deduplicates one primary degradation per concrete TTS attempt", () => {
    const registry = new TranslatorTtsAttemptRegistry();
    expect(registry.claimFailureEvent("turn-1:1")).toBe(true);
    expect(registry.claimFailureEvent("turn-1:1")).toBe(false);
    expect(registry.claimFailureEvent("turn-1:2")).toBe(true);
  });
});
