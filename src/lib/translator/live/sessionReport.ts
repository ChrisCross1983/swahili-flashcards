import type {
  LiveSessionReport,
  LiveSessionSummary,
  LiveTranscriptTurn,
} from "./types";

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function timing(turns: LiveTranscriptTurn[], key: "speechEndToFirstTranslationMs" | "speechEndToFirstAudioMs") {
  return turns.flatMap((turn) => {
    const value = turn[key];
    return value == null ? [] : [value];
  });
}

export function summarizeLiveSession(turns: LiveTranscriptTurn[]): LiveSessionSummary {
  const translation = timing(turns, "speechEndToFirstTranslationMs");
  const audio = timing(turns, "speechEndToFirstAudioMs");
  return {
    totalTurns: turns.length,
    successfulTurns: turns.filter((turn) => turn.status === "success").length,
    failedTurns: turns.filter((turn) => turn.status !== "success").length,
    unknownTurns: turns.filter((turn) => turn.status === "unknown").length,
    detectErrors: turns.filter((turn) => turn.detectionStatus === "error").length,
    discardedTurns: turns.filter((turn) =>
      turn.status === "discarded" || turn.status === "ignored"
    ).length,
    deTurns: turns.filter((turn) => turn.sourceLanguage === "de").length,
    swTurns: turns.filter((turn) => turn.sourceLanguage === "sw").length,
    avgSpeechEndToFirstTranslationMs: average(translation),
    avgSpeechEndToFirstAudioMs: average(audio),
    medianSpeechEndToFirstTranslationMs: median(translation),
    medianSpeechEndToFirstAudioMs: median(audio),
  };
}

type ReportInput = {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  userAgent: string;
  platform: string;
  turnSilenceMs: number;
  turns: LiveTranscriptTurn[];
};

export function buildLiveSessionReport(input: ReportInput): LiveSessionReport {
  const turns = input.turns.map((turn) => ({ ...turn }));
  return {
    session: {
      sessionId: input.sessionId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      userAgent: input.userAgent,
      platform: input.platform,
      turnSilenceMs: input.turnSilenceMs,
      ...summarizeLiveSession(turns),
    },
    turns,
  };
}

export function liveReportFilename(now = new Date()) {
  const [date, time] = now.toISOString().slice(0, 16).split("T");
  const stamp = `${date}-${time.replace(":", "")}`;
  return `translator-live-report-${stamp}.json`;
}
