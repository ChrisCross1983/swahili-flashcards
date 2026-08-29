import { describe, expect, it } from "vitest";
import { buildLiveSessionReport, liveReportFilename, summarizeLiveSession } from "../sessionReport";
import type { LiveTranscriptTurn } from "../types";

function turn(patch: Partial<LiveTranscriptTurn> = {}): LiveTranscriptTurn {
  return {
    turnId: "turn-1",
    startedAt: "2026-08-25T07:54:00.000Z",
    endedAt: "2026-08-25T07:54:02.000Z",
    status: "success",
    sourceLanguage: "de",
    targetLanguage: "sw",
    sourceTranscript: "Guten Morgen",
    translatedTranscript: "Habari za asubuhi",
    detectedLanguage: "de",
    detectionStatus: "success",
    detectHttpStatus: 200,
    detectErrorCode: null,
    selectedSidecar: "sw",
    discardedSidecar: "de",
    turnDurationMs: 2_000,
    silenceDurationMs: 1_000,
    speechEndToFirstTranslationMs: 100,
    speechEndToFirstAudioMs: 200,
    speechEndToTranslationCompleteMs: 400,
    speechEndToAudioCompleteMs: 900,
    speechEndToPlaybackStartedMs: 250,
    speechStartToFirstTranslationMs: 700,
    firstTranslationRelativeToSpeechEndMs: -100,
    firstAudioRelativeToSpeechEndMs: 200,
    firstRemoteAudioAt: "2026-08-25T07:54:01.200Z",
    selectedAudioReadyAt: "2026-08-25T07:54:02.100Z",
    playbackStartedAt: "2026-08-25T07:54:02.250Z",
    audioCompletedAt: "2026-08-25T07:54:02.900Z",
    playbackStarted: true,
    playbackStopped: true,
    errorCode: null,
    sidecars: {
      sw: {
        sourceTranscript: "Guten Morgen",
        translatedTranscript: "Habari za asubuhi",
        transcriptStartedAt: "2026-08-25T07:54:00.700Z",
        transcriptCompletedAt: "2026-08-25T07:54:01.100Z",
        hadRemoteAudio: true,
        remoteTrackReceived: true,
        audioCaptureStarted: true,
        audioBlobSize: 123,
        audioErrorCode: null,
      },
      de: {
        sourceTranscript: "Guten Morgen",
        translatedTranscript: "Guten Morgen",
        transcriptStartedAt: "2026-08-25T07:54:00.800Z",
        transcriptCompletedAt: "2026-08-25T07:54:01.200Z",
        hadRemoteAudio: true,
        remoteTrackReceived: true,
        audioCaptureStarted: true,
        audioBlobSize: 120,
        audioErrorCode: null,
      },
    },
    ...patch,
  };
}

describe("live session report", () => {
  it("summarizes success, unknown, detect errors, discards and timing values", () => {
    const turns = [
      turn(),
      turn({
        turnId: "turn-2",
        status: "unknown",
        sourceLanguage: "unknown",
        targetLanguage: null,
        detectedLanguage: "unknown",
        detectionStatus: "unknown",
        speechEndToFirstTranslationMs: null,
        speechEndToFirstAudioMs: null,
      }),
      turn({
        turnId: "turn-3",
        status: "discarded",
        sourceLanguage: "sw",
        targetLanguage: null,
        detectedLanguage: "sw",
        detectionStatus: "error",
        speechEndToFirstTranslationMs: 300,
        speechEndToFirstAudioMs: 400,
      }),
    ];
    expect(summarizeLiveSession(turns)).toEqual({
      totalTurns: 3,
      successfulTurns: 1,
      failedTurns: 2,
      unknownTurns: 1,
      detectErrors: 1,
      discardedTurns: 1,
      deTurns: 1,
      swTurns: 1,
      avgSpeechEndToFirstTranslationMs: 200,
      avgSpeechEndToFirstAudioMs: 300,
      medianSpeechEndToFirstTranslationMs: 200,
      medianSpeechEndToFirstAudioMs: 300,
    });
  });

  it("exports the complete ordered session without secret-shaped fields", () => {
    const turns = [turn(), turn({ turnId: "turn-2", sourceTranscript: "Habari" })];
    const report = buildLiveSessionReport({
      sessionId: "session-1",
      startedAt: "2026-08-25T07:54:00.000Z",
      endedAt: null,
      userAgent: "Mobile Safari",
      platform: "iPhone",
      turnSilenceMs: 1_000,
      turns,
    });
    expect(report.turns.map((item) => item.turnId)).toEqual(["turn-1", "turn-2"]);
    expect(report.turns[0]).toMatchObject({
      sourceTranscript: "Guten Morgen",
      translatedTranscript: "Habari za asubuhi",
      speechEndToFirstTranslationMs: 100,
      speechEndToFirstAudioMs: 200,
      firstTranslationRelativeToSpeechEndMs: -100,
      sidecars: {
        sw: {
          sourceTranscript: "Guten Morgen",
          translatedTranscript: "Habari za asubuhi",
          hadRemoteAudio: true,
        },
      },
    });
    expect(report.session).toMatchObject({ sessionId: "session-1", totalTurns: 2, turnSilenceMs: 1_000 });
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/clientSecret|apiKey|authorization|sdp|audioData/i);
    expect(liveReportFilename(new Date("2026-08-25T07:54:00.000Z"))).toBe(
      "translator-live-report-2026-08-25-0754.json",
    );
  });
});
