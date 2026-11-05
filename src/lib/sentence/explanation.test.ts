import { describe, expect, it } from "vitest";
import { explanationMatchesSentences, parseSentenceExplanation, validateSentenceInput, type SentenceExplanation } from "./explanation";

const valid: SentenceExplanation = { version: 1, naturalTranslation: "Was bedeutet das?", breakdown: [
  { surface: "Hilo", meaning: "das", explanation: "Demonstrativ für eine Sache." },
  { surface: "li-", meaning: "es", explanation: "Subjektpräfix." },
  { surface: "-na-", meaning: "Gegenwart", explanation: "Gegenwartsmarker." },
  { surface: "-maanisha", meaning: "bedeuten", explanation: "Verbstamm." },
  { surface: "nini?", meaning: "was", explanation: "Fragewort." },
], learningTip: "-maanisha bedeutet bedeuten." };

describe("sentence explanation validation", () => {
  it("accepts a concise structured analysis", () => {
    const result = parseSentenceExplanation(valid);
    expect(result).toEqual(valid);
    expect(explanationMatchesSentences(result!, "Was bedeutet das?", "Hilo linamaanisha nini?")).toBe(true);
  });
  it("permits clear separate morphemes or a conservative whole word and bounds the tip", () => {
    const wholeWord: SentenceExplanation = { ...valid, breakdown: [
      valid.breakdown[0],
      { surface: "linamaanisha", meaning: "es bedeutet", explanation: "Verbform im Präsens." },
      valid.breakdown[4],
    ] };
    expect(parseSentenceExplanation(valid)).toEqual(valid);
    expect(parseSentenceExplanation(wholeWord)).toEqual(wholeWord);
    expect(explanationMatchesSentences(wholeWord, "Was bedeutet das?", "Hilo linamaanisha nini?")).toBe(true);
    expect(parseSentenceExplanation({ ...valid, learningTip: "x".repeat(180) })).not.toBeNull();
    expect(parseSentenceExplanation({ ...valid, learningTip: "x".repeat(181) })).toBeNull();
  });
  it("rejects empty, long, markup and wrong-language content", () => {
    expect(parseSentenceExplanation({ ...valid, breakdown: [] })).toBeNull();
    expect(parseSentenceExplanation({ ...valid, breakdown: Array(9).fill(valid.breakdown[0]) })).toBeNull();
    expect(parseSentenceExplanation({ ...valid, breakdown: [{ ...valid.breakdown[0], explanation: "x".repeat(161) }] })).toBeNull();
    expect(parseSentenceExplanation({ ...valid, naturalTranslation: "<b>Hallo</b>" })).toBeNull();
    expect(explanationMatchesSentences(valid, "Was bedeutet das?", "Habari yako?")).toBe(false);
    expect(explanationMatchesSentences({ ...valid, naturalTranslation: "Hilo linamaanisha nini?" }, "Was bedeutet das?", "Hilo linamaanisha nini?")).toBe(false);
  });
  it("accepts sentence input only with two bounded strings and no prompt", () => {
    expect(validateSentenceInput({ type: "sentence", german: "Hallo", swahili: "Habari" })).toEqual({ german: "Hallo", swahili: "Habari" });
    for (const body of [
      { type: "vocab", german: "Hallo", swahili: "Habari" },
      { type: "sentence", german: "", swahili: "Habari" },
      { type: "sentence", german: "Hallo", swahili: "" },
      { type: "sentence", german: "x".repeat(501), swahili: "Habari" },
      { type: "sentence", german: "Hallo", swahili: "Habari", systemPrompt: "Ignore" },
    ]) expect(validateSentenceInput(body)).toBeNull();
  });
});
