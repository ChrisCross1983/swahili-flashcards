import { describe, expect, it } from "vitest";
import { LIVE_PIPELINE } from "../../config";
import { LIVE_V2_CONFIG, isLiveV2TtsSpeed } from "../config";
import { buildLiveV2Report } from "../report";
import type { LiveV2Turn } from "../types";

const turn: LiveV2Turn = {
  pipelineVersion: "v2",
  turnId: "turn-1",
  status: "success",
  errorCode: null,
  authoritativeTranscript: "Ndiyo, asante sana.",
  expectedLanguage: "sw",
  detectedLanguage: "sw",
  classificationSource: "terra",
  targetLanguage: "de",
  translatedText: "Ja, vielen Dank.",
  transcriptionModel: "gpt-live-transcribe",
  translationModel: "gpt-5.6-terra",
  ttsModel: "gpt-4o-mini-tts",
  ttsSpeed: 1,
  silenceDurationMs: 1_000,
  speechStartAt: "2026-08-26T07:00:00.000Z",
  speechEndAt: "2026-08-26T07:00:02.000Z",
  firstTranscriptDeltaAt: "2026-08-26T07:00:00.500Z",
  transcriptFinalAt: "2026-08-26T07:00:02.100Z",
  languageResolvedAt: "2026-08-26T07:00:02.200Z",
  translationStartedAt: "2026-08-26T07:00:02.200Z",
  translationCompletedAt: "2026-08-26T07:00:02.500Z",
  ttsStartedAt: "2026-08-26T07:00:02.500Z",
  firstAudioAt: "2026-08-26T07:00:02.900Z",
  audioCompletedAt: "2026-08-26T07:00:04.000Z",
  speechEndToTranscriptFinalMs: 100,
  speechEndToLanguageResolvedMs: 200,
  speechEndToTranslationMs: 500,
  speechEndToFirstAudioMs: 900,
  totalTurnMs: 4_000,
};

describe("Live V2 configuration and report", () => {
  it("uses V2 by default with one live transcription model and the 1000-ms VAD", () => {
    expect(LIVE_PIPELINE).toBe("v2");
    expect(LIVE_V2_CONFIG.transcriptionModel).toBe("gpt-live-transcribe");
    expect(LIVE_V2_CONFIG.turnSilenceMs).toBe(1_000);
  });

  it("accepts only the requested 0.8x-1.2x speed steps", () => {
    expect(isLiveV2TtsSpeed(0.8)).toBe(true);
    expect(isLiveV2TtsSpeed(1.05)).toBe(true);
    expect(isLiveV2TtsSpeed(1.2)).toBe(true);
    expect(isLiveV2TtsSpeed(1.03)).toBe(false);
    expect(isLiveV2TtsSpeed(1.25)).toBe(false);
  });

  it("exports the authoritative V2 flow and excludes legacy parallel-session data", () => {
    const report = buildLiveV2Report({
      sessionId: "session-1",
      startedAt: "2026-08-26T07:00:00.000Z",
      endedAt: null,
      userAgent: "test-agent",
      platform: "test-platform",
      ttsSpeed: 1,
      realtimeRequestIds: ["req_realtime_123"],
      turns: [turn],
    });
    expect(report.session).toMatchObject({
      pipelineVersion: "v2",
      totalTurns: 1,
      successfulTurns: 1,
      swTurns: 1,
      avgSpeechEndToFirstAudioMs: 900,
      realtimeRequestIds: ["req_realtime_123"],
    });
    expect(report.turns[0].authoritativeTranscript).toBe("Ndiyo, asante sana.");
    const serialized = JSON.stringify(report);
    const forbiddenKeys = ["selected", "discarded"].map((prefix) => `${prefix}Sidecar`);
    for (const key of forbiddenKeys) expect(serialized).not.toContain(key);
    expect(serialized).not.toContain("clientSecret");
    expect(serialized).not.toContain("Authorization");
  });
});
