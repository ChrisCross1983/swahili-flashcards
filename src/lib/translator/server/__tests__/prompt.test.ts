import { describe, expect, it } from "vitest";
import {
  buildAutoInterpreterPrompt,
  buildInterpreterPrompt,
} from "@/lib/translator/server/prompt";

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

  it("combines AUTO language detection and translation without answering", () => {
    const prompt = buildAutoInterpreterPrompt().toLowerCase();

    expect(prompt).toContain("determine whether");
    expect(prompt).toContain("sourceLanguage = de".toLowerCase());
    expect(prompt).toContain("sourceLanguage = sw".toLowerCase());
    expect(prompt).toContain("sourceLanguage = unknown".toLowerCase());
    expect(prompt).toContain("targetLanguage = null".toLowerCase());
    expect(prompt).toContain("never answer");
    expect(prompt).toContain("never react");
    expect(prompt).toContain("preserve names, numbers, dates, prices, times");
    expect(prompt).toContain("tanzanian kiswahili");
    expect(prompt).toContain("return only the structured result");
  });
});
