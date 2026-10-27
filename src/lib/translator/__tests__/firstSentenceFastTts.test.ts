import { describe, expect, it } from "vitest";
import { assessClauseForSpeech, assessFirstSentenceForSpeech, resolveTranslatorTtsQaMode, splitFirstSentenceForSpeech } from "@/lib/translator/firstSentenceFastTts";

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

describe("preview clause speech eligibility", () => {
  const realText = "Tumemaliza tu kula chakula cha mchana, sasa tunaenda kutembea kidogo, halafu tutaenda mjini kwa muda mfupi kununua vitu.";

  it("splits the real Terra example only at an allowed complete clause", () => {
    expect(assessFirstSentenceForSpeech(realText).reason).toBe("no_clear_sentence_boundary");
    const result = assessClauseForSpeech(realText, "sw");
    expect(result).toEqual({
      split: {
        first: "Tumemaliza tu kula chakula cha mchana,",
        rest: " sasa tunaenda kutembea kidogo, halafu tutaenda mjini kwa muda mfupi kununua vitu.",
      },
      reason: "eligible_clause",
      boundary: "comma_sasa",
    });
    expect(result.split!.first + result.split!.rest).toBe(realText);
    expect(result.split!.first).toHaveLength(38);
    expect(result.split!.rest).toHaveLength(82);
  });

  it("accepts only the preview connector allowlists", () => {
    for (const connector of ["sasa", "halafu", "kisha"]) {
      const text = realText.replace(", sasa ", `, ${connector} `);
      expect(assessClauseForSpeech(text, "sw").boundary).toBe(`comma_${connector}`);
    }
    for (const connector of ["jetzt", "danach", "anschließend", "dann"]) {
      const text = `Wir haben gerade zu Mittag gegessen, ${connector} gehen wir noch etwas spazieren und kaufen in der Stadt Lebensmittel für das Abendessen.`;
      expect(assessClauseForSpeech(text, "de").boundary).toBe(`comma_${connector}`);
    }
    expect(assessClauseForSpeech(realText.replace(", sasa ", ", lakini "), "sw").split).toBeNull();
  });

  it("falls back on numbers, times, medical facts, negation, enumerations and short text", () => {
    const unsafe = [
      realText.replace("mchana,", "mchana saa 8:30,"),
      realText.replace("vitu.", "vitu 20,000 TZS, si 25,000 TZS."),
      realText.replace("chakula cha mchana", "vidonge viwili vya dawa"),
      realText.replace("Tumemaliza", "Hatukumaliza"),
      realText.replace(", halafu ", ", matunda, halafu "),
    ];
    for (const text of unsafe) expect(assessClauseForSpeech(text, "sw").split).toBeNull();
    expect(assessClauseForSpeech("Habari za asubuhi.", "sw").reason).toBe("clause_text_too_short");
    expect(assessClauseForSpeech("A".repeat(4_001), "sw").split).toBeNull();
  });
});
