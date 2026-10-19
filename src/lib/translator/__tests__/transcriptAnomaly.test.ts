import { describe, expect, it } from "vitest";
import { analyzeTranscriptAnomaly } from "@/lib/translator/transcriptAnomaly";

const check = (transcript: string, audioQuality: Parameters<typeof analyzeTranscriptAnomaly>[0]["audioQuality"] = null) =>
  analyzeTranscriptAnomaly({ transcript, autoMode: true, audioQuality });

describe("Safe-Audio transcript plausibility", () => {
  it.each([
    ["mbili ".repeat(40), "extreme_token_repetition"],
    ["asante sana ".repeat(20), "repeated_phrase_loop"],
    ["ich weiß nicht ".repeat(12), "repeated_phrase_loop"],
    ["moja mbili ".repeat(25), "repeated_phrase_loop"],
    ["Дякую за перегляд і до зустрічі у наступному відео!", "unexpected_script"],
  ])("blocks %s", (transcript, reason) => {
    expect(check(transcript)).toMatchObject({
      transcriptAnomalyDetected: true,
      transcriptAnomalyReason: reason,
    });
  });

  it.each([
    "mbili mbili",
    "hapana hapana hapana",
    "nein nein nein",
    "Kwa hiyo ninaenda sokoni leo na kesho nitarudi nyumbani kwa sababu watoto wanahitaji chakula na maji.",
    "Ich gehe heute zum Markt und komme morgen wieder zurück.",
    "moja mbili tatu nne tano sita saba nane tisa kumi",
    "asante sana asante sana asante sana",
    "ich weiß nicht ich weiß nicht ich weiß nicht",
    "Jina langu ni Мария na ninaishi hapa.",
  ])("allows %s", (transcript) => {
    expect(check(transcript).transcriptAnomalyDetected).toBe(false);
  });

  it("uses measured near silence only with a nontrivial transcript", () => {
    const audioQuality = {
      source: "realtime_analyser" as const,
      evidence: "measured" as const,
      silenceRatio: 1,
      speechActivityRatio: 0,
    };
    expect(check("Habari yako rafiki yangu?", audioQuality).transcriptAnomalyReason)
      .toBe("speech_audio_mismatch");
    expect(check("mbili mbili", audioQuality).transcriptAnomalyDetected).toBe(false);
    expect(check("Habari yako rafiki yangu?", {
      ...audioQuality, silenceRatio: null, speechActivityRatio: null,
    }).transcriptAnomalyDetected).toBe(false);
    expect(check("mbili ".repeat(40), null).transcriptAnomalyDetected).toBe(true);
  });
});
