import { describe, expect, it } from "vitest";
import { assessFirstSentenceForSpeech, resolveTranslatorTtsQaMode, splitFirstSentenceForSpeech } from "@/lib/translator/firstSentenceFastTts";

const first = "Leo ilikuwa siku yenye shughuli nyingi sana.";
const rest = " Asubuhi nilikwenda sokoni na kununua matunda mengi. Baadaye nilikutana na rafiki yangu na tukazungumza kwa muda mrefu. Jioni nilirudi nyumbani, nikapika chakula, na nikapumzika baada ya siku ndefu yenye shughuli nyingi na mazungumzo mazuri pamoja na marafiki zangu wa karibu.";

describe("first-sentence-fast speech eligibility", () => {
  it("allows only the two preview QA modes behind the spike flag", () => {
    expect(resolveTranslatorTtsQaMode("?ttsMode=segmented", true)).toBe("segmented");
    expect(resolveTranslatorTtsQaMode("?ttsMode=legacy", true)).toBe("legacy");
    expect(resolveTranslatorTtsQaMode("", true)).toBe("default");
    expect(resolveTranslatorTtsQaMode("?ttsMode=unknown", true)).toBe("default");
    expect(resolveTranslatorTtsQaMode("?ttsMode=segmented", false)).toBe("default");
    expect(resolveTranslatorTtsQaMode("?ttsMode=legacy", false)).toBe("default");
  });
  it("leaves short and medium one-sentence turns alone", () => {
    expect(splitFirstSentenceForSpeech("Habari za asubuhi.")).toBeNull();
    expect(splitFirstSentenceForSpeech("A".repeat(295) + ".")).toBeNull();
    expect(splitFirstSentenceForSpeech("A".repeat(305) + ".")).toBeNull();
  });

  it("requires a short first sentence and a substantial complete remainder", () => {
    expect(assessFirstSentenceForSpeech("A".repeat(90) + ". " + "B".repeat(250) + ".").reason)
      .toBe("first_sentence_too_long");
    expect(assessFirstSentenceForSpeech(first + " " + "B".repeat(210) + ".").reason)
      .toBe("remainder_too_short");
  });

  it("treats comparable 297- and 311-character multi-sentence translations alike", () => {
    for (const length of [297, 311]) {
      const text = first + " " + "B".repeat(length - first.length - 2) + ".";
      expect(text).toHaveLength(length);
      expect(assessFirstSentenceForSpeech(text).reason).toBe("eligible");
      const split = splitFirstSentenceForSpeech(text)!;
      expect(split.first + split.rest).toBe(text);
    }
  });

  it("returns exactly two unchanged parts for a suitable multi-sentence turn", () => {
    const text = first + rest;
    const split = splitFirstSentenceForSpeech(text);
    expect(split).toEqual({ first, rest });
    expect(split!.first + split!.rest).toBe(text);
  });

  it("rejects ambiguous boundaries and text beyond the application speech limit", () => {
    expect(splitFirstSentenceForSpeech("Dr. " + rest.repeat(2))).toBeNull();
    expect(splitFirstSentenceForSpeech("Leo nilionana na Prof. " + rest.repeat(2))).toBeNull();
    expect(splitFirstSentenceForSpeech(first + "  " + rest.slice(1).repeat(2))).toBeNull();
    expect(splitFirstSentenceForSpeech(first + " " + "B".repeat(4_000) + ".")).toBeNull();
  });
});
