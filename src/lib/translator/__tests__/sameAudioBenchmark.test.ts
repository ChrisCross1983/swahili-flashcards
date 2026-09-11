import { describe, expect, it, vi } from "vitest";
import { SameAudioBenchmarkRunner } from "@/lib/translator/sameAudioBenchmark";

const eligibleInput = {
  turnId: "turn-1",
  audioBlob: new Blob(["audio"], { type: "audio/webm" }),
  primaryTranscript: "Unaitwa nani?",
  primaryCompletedAt: "2026-09-10T10:00:00.000Z",
  primaryEngine: "gpt-live-transcribe",
  primaryRoute: "realtime" as const,
  direction: { sourceLanguage: "sw" as const, targetLanguage: "de" as const },
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
    const request = vi.fn(async (audio: Blob) => {
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
    await vi.waitFor(() => expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({ benchmarkStatus: "completed" })));
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
