import { LIVE_V2_CONFIG } from "./config";
import type { LiveV2SessionReport, LiveV2Turn } from "./types";

function average(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return Math.round(present.reduce((sum, value) => sum + value, 0) / present.length);
}

export function buildLiveV2Report(input: {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  userAgent: string;
  platform: string;
  ttsSpeed: number;
  realtimeRequestIds: string[];
  turns: LiveV2Turn[];
}): LiveV2SessionReport {
  const turns = input.turns.map((turn) => ({ ...turn }));
  const successfulTurns = turns.filter((turn) => turn.status === "success").length;
  return {
    session: {
      pipelineVersion: "v2",
      sessionId: input.sessionId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      userAgent: input.userAgent,
      platform: input.platform,
      turnSilenceMs: LIVE_V2_CONFIG.turnSilenceMs,
      transcriptionModel: LIVE_V2_CONFIG.transcriptionModel,
      translationModel: LIVE_V2_CONFIG.translationModel,
      ttsModel: LIVE_V2_CONFIG.ttsModel,
      ttsSpeed: input.ttsSpeed,
      realtimeRequestIds: [...input.realtimeRequestIds],
      totalTurns: turns.length,
      successfulTurns,
      failedTurns: turns.length - successfulTurns,
      unknownTurns: turns.filter((turn) => turn.status === "unknown").length,
      discardedTurns: turns.filter((turn) => turn.status === "discarded").length,
      deTurns: turns.filter((turn) => turn.detectedLanguage === "de").length,
      swTurns: turns.filter((turn) => turn.detectedLanguage === "sw").length,
      avgSpeechEndToTranscriptFinalMs: average(
        turns.map((turn) => turn.speechEndToTranscriptFinalMs),
      ),
      avgSpeechEndToLanguageResolvedMs: average(
        turns.map((turn) => turn.speechEndToLanguageResolvedMs),
      ),
      avgSpeechEndToTranslationMs: average(
        turns.map((turn) => turn.speechEndToTranslationMs),
      ),
      avgSpeechEndToFirstAudioMs: average(
        turns.map((turn) => turn.speechEndToFirstAudioMs),
      ),
    },
    turns,
  };
}

export function liveV2ReportFilename(now = new Date()) {
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `translator-live-v2-report-${stamp}.json`;
}
