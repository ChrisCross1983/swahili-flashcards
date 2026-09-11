import { describe, expect, it, vi } from "vitest";
import { SameAudioBenchmarkRunner } from "@/lib/translator/sameAudioBenchmark";
import { SAFE_STT_PARITY_VERSION } from "@/lib/translator/speechQuality";
import { TranslatorOperationError } from "@/lib/translator/reliability";

const eligibleInput = {
  turnId: "turn-1",
  audioBlob: new Blob(["audio"], { type: "audio/webm" }),
  primaryTranscript: "Unaitwa nani?",
  primaryCompletedAt: "2026-09-10T10:00:00.000Z",
  primaryEngine: "gpt-live-transcribe",
  primaryRoute: "realtime" as const,
  fallbackDirection: { sourceLanguage: "sw" as const, targetLanguage: "de" as const },
  recordingDurationMs: 1_000,
  consent: {
    consentAtRecordingStart: {
      diagnosticsSharingEnabled: false, qualityContentSharingEnabled: false,
      speechSampleSharingEnabled: true, internalSpeechDiagnosticsEnabled: true,
    },
    consentAtTurnFinalization: {
      diagnosticsSharingEnabled: false, qualityContentSharingEnabled: false,
      speechSampleSharingEnabled: true, internalSpeechDiagnosticsEnabled: true,
    },
  },
  internalQaEnabled: true,
};

describe("SameAudioBenchmarkRunner", () => {
  it("claims a turn exactly once even when called twice like React Strict Mode", async () => {
    const request = vi.fn(async (
      audio: Blob,
      _direction: unknown,
      _options: unknown,
    ) => {
      void _direction;
      void _options;
      expect(audio).toBe(eligibleInput.audioBlob);
      return {
      transcript: "Unaitwa nani?", model: "gpt-4o-mini-transcribe",
      fallbackUsed: false, transcriptionMs: 400, completedAt: "2026-09-10T10:00:01.000Z",
      };
    });
    const updates = vi.fn();
    const runner = new SameAudioBenchmarkRunner(request);
    expect(runner.run(eligibleInput, updates)).toBe(true);
    expect(runner.run(eligibleInput, updates)).toBe(false);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0][0]).toBe(eligibleInput.audioBlob);
    expect(request.mock.calls[0][1]).toEqual(eligibleInput.fallbackDirection);
    expect(updates.mock.calls[0][0]).toEqual(expect.objectContaining({
      benchmarkParityVersion: SAFE_STT_PARITY_VERSION,
    }));
    await vi.waitFor(() => expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({ benchmarkStatus: "completed" })));
  });

  it("keeps AUTO language detection when the product fallback would use AUTO", async () => {
    const request = vi.fn(async (_audio: Blob, direction: unknown) => {
      expect(direction).toEqual({ sourceLanguage: "auto", targetLanguage: "auto" });
      return {
        transcript: "Unaitwa nani?", model: "gpt-4o-mini-transcribe",
        fallbackUsed: false, transcriptionMs: 400, completedAt: new Date().toISOString(),
      };
    });
    const runner = new SameAudioBenchmarkRunner(request);
    runner.run({
      ...eligibleInput,
      fallbackDirection: { sourceLanguage: "auto", targetLanguage: "auto" },
    }, vi.fn());
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  });

  it("uses the product fallback's one retry for a retryable safe-STT request", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new TranslatorOperationError({
        category: "SERVICE_UNAVAILABLE", message: "temporarily unavailable",
        healthStatus: "offline", httpStatus: 503, apiErrorCode: "transcription_failed",
        retryable: true, retryAfterMs: 12, authFailureType: null,
      }))
      .mockResolvedValueOnce({
        transcript: "Unaitwa nani?", model: "gpt-4o-mini-transcribe",
        fallbackUsed: false, transcriptionMs: 400, completedAt: new Date().toISOString(),
      });
    const wait = vi.fn(async () => undefined);
    const runner = new SameAudioBenchmarkRunner(request, wait);
    const updates = vi.fn();
    runner.run(eligibleInput, updates);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(wait).toHaveBeenCalledWith(12, expect.any(AbortSignal));
    expect(request.mock.calls.map(([, , options]) => options.requestAttempt)).toEqual([0, 1]);
    await vi.waitFor(() => expect(updates).toHaveBeenLastCalledWith(
      expect.objectContaining({ benchmarkStatus: "completed" }),
    ));
  });

  it("does not request secondary STT when internal QA or consent is off", () => {
    const request = vi.fn();
    const runner = new SameAudioBenchmarkRunner(request);
    expect(runner.run({ ...eligibleInput, internalQaEnabled: false }, vi.fn())).toBe(false);
    expect(runner.run({ ...eligibleInput, turnId: "turn-2", consent: {
      ...eligibleInput.consent,
      consentAtRecordingStart: { ...eligibleInput.consent.consentAtRecordingStart, speechSampleSharingEnabled: false },
    } }, vi.fn())).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("isolates a secondary failure and reports it only as benchmark failure", async () => {
    const request = vi.fn(async () => { throw new Error("503"); });
    const updates = vi.fn();
    const runner = new SameAudioBenchmarkRunner(request);
    expect(runner.run(eligibleInput, updates)).toBe(true);
    await vi.waitFor(() => expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({
      benchmarkStatus: "failed", benchmarkFailure: "503",
    })));
  });

  it("drops late writes after reset", async () => {
    let resolveRequest!: (value: { transcript: string; model: string; fallbackUsed: boolean; transcriptionMs: number; completedAt: string }) => void;
    const request = vi.fn(() => new Promise<{
      transcript: string; model: string; fallbackUsed: boolean;
      transcriptionMs: number; completedAt: string;
    }>((resolve) => { resolveRequest = resolve; }));
    const updates = vi.fn();
    const runner = new SameAudioBenchmarkRunner(request);
    runner.run(eligibleInput, updates);
    runner.reset();
    resolveRequest({ transcript: "late", model: "gpt-4o-mini-transcribe", fallbackUsed: false, transcriptionMs: 1, completedAt: new Date().toISOString() });
    await Promise.resolve();
    await Promise.resolve();
    expect(updates).toHaveBeenCalledTimes(1);
  });
});
