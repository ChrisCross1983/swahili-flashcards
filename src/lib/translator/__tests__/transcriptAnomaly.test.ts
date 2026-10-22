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

  it("ignores live-analyser silence for normal German and Kiswahili", () => {
    const audioQuality = {
      source: "realtime_analyser" as const,
      evidence: "measured" as const,
      rmsDbfs: null,
      peakDbfs: null,
      silenceRatio: 1,
      speechActivityRatio: 0,
    };
    for (const transcript of [
      "Ich gehe heute zum Markt und komme morgen wieder zurück.",
      "Habari yako rafiki yangu?",
    ]) {
      expect(check(transcript, audioQuality)).toMatchObject({
        transcriptAnomalyDetected: false,
        transcriptAudioSpeechMismatchDetected: false,
      });
    }
    expect(check("Habari yako rafiki yangu?", {
      ...audioQuality, silenceRatio: null, speechActivityRatio: null,
    })).toMatchObject({
      transcriptAnomalyDetected: false,
      transcriptAudioSpeechMismatchDetected: false,
    });
    expect(check("Habari yako rafiki yangu?", null).transcriptAnomalyDetected)
      .toBe(false);
  });

  it("keeps text and script guards active with unreliable audio metrics", () => {
    const audioQuality = {
      source: "realtime_analyser" as const,
      evidence: "measured" as const,
      rmsDbfs: null,
      peakDbfs: null,
      silenceRatio: 1,
      speechActivityRatio: 0,
    };
    expect(check("mbili ".repeat(40), audioQuality)).toMatchObject({
      transcriptAnomalyReason: "extreme_token_repetition",
      transcriptAudioSpeechMismatchDetected: false,
    });
    expect(check("Дякую за перегляд і до зустрічі у наступному відео!", audioQuality))
      .toMatchObject({
        transcriptAnomalyReason: "unexpected_script",
        transcriptAudioSpeechMismatchDetected: false,
      });
  });

  it("does not infer same-upload evidence from a decoded_blob label", () => {
    const audioQuality = {
      source: "decoded_blob" as const, evidence: "measured" as const,
      rmsDbfs: -90, peakDbfs: -80,
      silenceRatio: 1, speechActivityRatio: 0,
    };
    expect(check("Habari yako rafiki yangu?", audioQuality)).toMatchObject({
      transcriptAnomalyDetected: false,
      transcriptAudioSpeechMismatchDetected: false,
    });
  });
});
