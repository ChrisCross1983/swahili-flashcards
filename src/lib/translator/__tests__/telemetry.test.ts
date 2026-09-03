import { describe, expect, it, vi } from "vitest";
import { TranslatorTelemetryQueue, type TranslatorTechnicalEvent } from "@/lib/translator/telemetry";
import { parseTechnicalDiagnosticEvent } from "@/lib/translator/server/diagnostics";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const event: TranslatorTechnicalEvent = {
  installationId: "installation-123", sessionId: "session-123", turnId: "turn-123",
  timestamp: "2026-09-02T00:00:00.000Z", appVersion: "1.0", buildVersion: "42",
  gitCommitSha: "abc", environment: "development", platform: "web",
  browserFamily: "Safari", browserVersion: "18", osFamily: "iOS",
  translatorMode: "auto", sourceLanguage: "sw", targetLanguage: "de",
  transcriptionPath: "realtime", transcriptionModel: "gpt-live-transcribe",
  translationModel: "gpt-5.6-terra", ttsModel: "gpt-4o-mini-tts", warmStart: true,
  realtimeConnectionReused: true, fallbackReason: null,
  recordClickToRecordingStartedMs: 9, stopToTranscriptFinalMs: 874,
  transcriptFinalToTranslationVisibleMs: 2500, stopToPlaybackStartedMs: 6774,
  translationServerPreOpenAiMs: 796, translationAuthMs: 524,
  translationOpenAiTotalMs: 2342, ttsServerPreOpenAiMs: 609, ttsAuthMs: 310,
  ttsOpenAiTimeToFirstByteMs: 1555, ttsOpenAiTotalMs: 2052, status: "success",
  failureCategory: null, httpStatus: null, apiErrorCode: null, errorStage: null,
  retryable: false, recoveryAction: "none", recoverySucceeded: null,
  eventOrigin: null, eventKind: null, qaScenarioId: null,
  diagnosticEvents: [],
  consentAtRecordingStart: null, consentAtTurnFinalization: null,
};

describe("translator telemetry queue", () => {
  it("does not enqueue or upload while consent is disabled", async () => {
    const fetcher = vi.fn();
    const queue = new TranslatorTelemetryQueue({ storage: storage(), fetcher, isEnabled: () => false });
    expect(queue.enqueue(event)).toBe(false);
    await queue.flush();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("batches enabled events and treats upload failure as non-critical", async () => {
    const fetcher = vi.fn(async () => { throw new Error("offline"); });
    const queue = new TranslatorTelemetryQueue({
      storage: storage(), fetcher, isEnabled: () => true, schedule: () => undefined,
    });
    expect(queue.enqueue(event)).toBe(true);
    await expect(queue.flush()).resolves.toBeUndefined();
    expect(queue.pendingCount()).toBe(1);
  });

  it("allowlists technical fields and drops secrets/content/audio", () => {
    const parsed = parseTechnicalDiagnosticEvent({
      ...event,
      diagnosticEvents: [{
        eventId: "event-1", at: "2026-09-02T00:00:01.000Z",
        eventOrigin: "qa_simulation", eventKind: "degradation", category: "TTS",
        stage: "speech", endpoint: null, httpStatus: 503,
        apiCode: "qa_tts_failure", retryable: true,
        recoveryAction: "keep_translation_without_tts", recoverySucceeded: true,
        qaScenarioId: "qa_tts_503", authFailureType: null,
        stacktrace: "Bearer secret",
      }],
      authorization: "Bearer secret",
      originalText: "private sentence",
      audio: "base64-data",
    });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("authorization");
    expect(parsed).not.toHaveProperty("originalText");
    expect(parsed).not.toHaveProperty("audio");
    expect(parsed?.diagnosticEvents).toEqual([
      expect.objectContaining({
        eventOrigin: "qa_simulation", eventKind: "degradation",
        qaScenarioId: "qa_tts_503",
      }),
    ]);
    expect(parsed?.diagnosticEvents[0]).not.toHaveProperty("stacktrace");
  });
});
