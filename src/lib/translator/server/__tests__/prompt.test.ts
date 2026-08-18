import { describe, expect, it } from "vitest";
import { buildInterpreterPrompt } from "@/lib/translator/server/prompt";

describe("translator interpreter prompt", () => {
  it("strictly limits the model to Tanzanian Swahili translation", () => {
    const prompt = buildInterpreterPrompt({
      sourceLanguage: "de",
      targetLanguage: "sw",
    }).toLowerCase();

    expect(prompt).toContain("translate only");
    expect(prompt).toContain("never answer");
    expect(prompt).toContain("never react");
    expect(prompt).toContain("preserve names, numbers, dates, prices, times");
    expect(prompt).toContain("tanzanian swahili");
    expect(prompt).toContain("communication in tanzania");
    expect(prompt).toContain("return only the translation text");
  });
});
