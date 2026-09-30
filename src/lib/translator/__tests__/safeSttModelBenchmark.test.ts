import { describe, expect, it, vi } from "vitest";
import {
  applySameAudioGroundTruthToSafeSttModelBenchmark,
  reviewSafeSttModelBenchmark,
  SafeSttModelBenchmarkRunner,
  summarizeSafeSttModelBenchmarks,
  type SafeSttModelBenchmark,
} from "@/lib/translator/safeSttModelBenchmark";
import { PRIMARY_TRANSCRIPTION_MODEL } from "@/lib/translator/server/models";
import { TranslatorOperationError } from "@/lib/translator/reliability";
import type { SameAudioBenchmarkComparison } from "@/lib/translator/speechQuality";

const audio = new Blob(["same-audio"], { type: "audio/webm" });
const consent = {
  consentAtRecordingStart: {
    diagnosticsSharingEnabled: false, qualityContentSharingEnabled: false,
    speechSampleSharingEnabled: true, internalSpeechDiagnosticsEnabled: true,
  },
  consentAtTurnFinalization: {
    diagnosticsSharingEnabled: false, qualityContentSharingEnabled: false,
    speechSampleSharingEnabled: true, internalSpeechDiagnosticsEnabled: true,
  },
};
const input = {
  turnId: "turn-1", audioBlob: audio,
  direction: { sourceLanguage: "auto", targetLanguage: "auto" } as const,
  resolvedSourceLanguage: "sw" as const, recordingDurationMs: 900,
  consent, internalQaEnabled: true,
};

describe("SafeSttModelBenchmarkRunner", () => {
  it("is QA-gated and sends each model the exact same recording Blob", async () => {
    const request = vi.fn(async (blob: Blob, _direction, options) => ({
      transcript: options.benchmarkModel ?? "baseline", model: options.benchmarkModel ?? PRIMARY_TRANSCRIPTION_MODEL,
      fallbackUsed: false, transcriptionMs: 100, completedAt: "2026-09-14T00:00:00.000Z",
    }));
    const runner = new SafeSttModelBenchmarkRunner(request);
    expect(runner.run({ ...input, internalQaEnabled: false }, vi.fn())).toBe(false);
    let result: SafeSttModelBenchmark | null = null;
    runner.run(input, (benchmark) => { result = benchmark; });
    await vi.waitFor(() => expect(result).not.toBeNull());

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([blob]) => blob === audio)).toBe(true);
    expect(request.mock.calls.map(([, , options]) => options.benchmarkModel)).toEqual([
      PRIMARY_TRANSCRIPTION_MODEL, "whisper-1",
    ]);
    expect(result).toMatchObject({ sameAudio: true, languageMode: "auto" });
  });

  it("shares one human ground truth across direct Mini and Whisper results", async () => {
    const runner = new SafeSttModelBenchmarkRunner(async (_blob, _direction, options) => {
      return {
        transcript: options.benchmarkModel === "whisper-1" ? "Habari yako leo" : "Habari ya leo",
        model: options.benchmarkModel ?? PRIMARY_TRANSCRIPTION_MODEL,
        fallbackUsed: false, transcriptionMs: 100, completedAt: "2026-09-14T00:00:00.000Z",
      };
    });
    let result: SafeSttModelBenchmark | null = null;
    runner.run(input, (benchmark) => { result = benchmark; });
    await vi.waitFor(() => expect(result).not.toBeNull());
    if (!result) throw new Error("benchmark did not complete");
    const reviewed = reviewSafeSttModelBenchmark(result, "Habari yako leo?");

    expect(reviewed.results.find((item) => item.requestedModel === "whisper-1")).toMatchObject({ actualModel: "whisper-1", wer: 0, normalizedExactMatch: true, fallbackUsed: false });
    expect(reviewed.results.find((item) => item.requestedModel === PRIMARY_TRANSCRIPTION_MODEL)).toMatchObject({ wer: 1 / 3, fallbackUsed: false });
  });

  it("records a failed direct baseline while remaining candidate requests proceed", async () => {
    const runner = new SafeSttModelBenchmarkRunner(async (_blob, _direction, options) => {
      if (options.benchmarkModel === PRIMARY_TRANSCRIPTION_MODEL) {
        throw new TranslatorOperationError({
          category: "TRANSCRIPTION", message: "safe", healthStatus: "healthy", httpStatus: 503,
          apiErrorCode: "benchmark_model_transcription_failed", retryable: false,
          retryAfterMs: null, authFailureType: null,
        });
      }
      return {
        transcript: "Habari yako leo", model: options.benchmarkModel!, fallbackUsed: false,
        transcriptionMs: 100, completedAt: "2026-09-14T00:00:00.000Z",
      };
    });
    let result: SafeSttModelBenchmark | null = null;
    runner.run(input, (benchmark) => { result = benchmark; });
    await vi.waitFor(() => expect(result).not.toBeNull());
    if (!result) throw new Error("benchmark did not complete");
    const completedBenchmark = result as SafeSttModelBenchmark;

    expect(completedBenchmark.results.find((item) => item.requestedModel === PRIMARY_TRANSCRIPTION_MODEL))
      .toMatchObject({ outcome: "runtime_failed", failureCategory: "transcription_failed", fallbackUsed: false });
    expect(completedBenchmark.results.filter((item) => item.requestedModel !== PRIMARY_TRANSCRIPTION_MODEL))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ requestedModel: "whisper-1", outcome: "completed", fallbackUsed: false }),
      ]));
  });

  it("isolates a direct Whisper failure from the completed product baseline", async () => {
    const runner = new SafeSttModelBenchmarkRunner(async (_blob, _direction, options) => {
      if (options.benchmarkModel === "whisper-1") {
        throw new TranslatorOperationError({
          category: "TRANSCRIPTION", message: "safe", healthStatus: "healthy", httpStatus: 503,
          apiErrorCode: "benchmark_model_transcription_failed", retryable: false,
          retryAfterMs: null, authFailureType: null,
        });
      }
      return {
        transcript: "Habari yako leo", model: options.benchmarkModel!, fallbackUsed: false,
        transcriptionMs: 100, completedAt: "2026-09-16T00:00:00.000Z",
      };
    });
    let result: SafeSttModelBenchmark | null = null;
    runner.run(input, (benchmark) => { result = benchmark; });
    await vi.waitFor(() => expect(result).not.toBeNull());
    if (!result) throw new Error("benchmark did not complete");
    const completedBenchmark = result as SafeSttModelBenchmark;

    expect(completedBenchmark.results.find((item) => item.requestedModel === "whisper-1"))
      .toMatchObject({ outcome: "runtime_failed", fallbackUsed: false });
    expect(completedBenchmark.results.find((item) => item.requestedModel === PRIMARY_TRANSCRIPTION_MODEL))
      .toMatchObject({ outcome: "completed", actualModel: PRIMARY_TRANSCRIPTION_MODEL });
  });

  it("calculates independent per-model and Kiswahili bucket metrics", () => {
    const benchmark: SafeSttModelBenchmark = reviewSafeSttModelBenchmark({
      benchmarkId: "b", turnId: "turn", benchmarkVersion: "safe-stt-model-benchmark-v1",
      sameAudio: true, languageMode: "sw", resolvedSourceLanguage: "sw",
      recordingDurationMs: 500, audioMimeType: "audio/webm", groundTruthTranscript: null,
      reviewedAt: null,
      results: [
        { requestedModel: PRIMARY_TRANSCRIPTION_MODEL, actualModel: PRIMARY_TRANSCRIPTION_MODEL, transcript: "Habari ya leo", transcriptionMs: 80, completedAt: null, outcome: "completed", failureCategory: null, failureReason: null, fallbackUsed: false, normalizedExactMatch: null, wer: null },
        { requestedModel: "whisper-1", actualModel: "whisper-1", transcript: "Habari yako leo", transcriptionMs: 110, completedAt: null, outcome: "completed", failureCategory: null, failureReason: null, fallbackUsed: false, normalizedExactMatch: null, wer: null },
        { requestedModel: "gpt-transcribe", actualModel: "gpt-transcribe", transcript: "Habari yako leo", transcriptionMs: 120, completedAt: null, outcome: "completed", failureCategory: null, failureReason: null, fallbackUsed: false, normalizedExactMatch: null, wer: null },
        { requestedModel: "gpt-4o-transcribe", actualModel: null, transcript: null, transcriptionMs: null, completedAt: null, outcome: "unavailable", failureCategory: "model_unavailable", failureReason: "benchmark_model_unavailable", fallbackUsed: false, normalizedExactMatch: null, wer: null },
      ],
    }, "Habari yako leo");
    const summary = summarizeSafeSttModelBenchmarks([benchmark]);

    expect(summary.find((item) => item.model === "gpt-transcribe")).toMatchObject({
      completedSamples: 1, unavailableFailures: 0, runtimeFailures: 0,
      reviewedSamples: 1, normalizedExactMatchRate: 1, kiswahiliReviewedSamples: 1, shortKiswahiliReviewedSamples: 1,
    });
    expect(summary.find((item) => item.model === PRIMARY_TRANSCRIPTION_MODEL)).toMatchObject({ completedSamples: 1, meanWer: 1 / 3 });
    expect(summary.find((item) => item.model === "whisper-1")).toMatchObject({ completedSamples: 1, normalizedExactMatchRate: 1, meanWer: 0 });
    expect(summary.find((item) => item.model === "gpt-4o-transcribe")).toMatchObject({ completedSamples: 0, unavailableFailures: 1, runtimeFailures: 0, accessOrRuntimeFailures: 1 });
  });

  it("produces identical ground-truth scoring whether review happens before or after async completion", async () => {
    const request = vi.fn(async (_blob: Blob, _direction, options) => ({
      transcript: options.benchmarkModel === "whisper-1" ? "Habari yako leo" : "Habari ya leo",
      model: options.benchmarkModel ?? PRIMARY_TRANSCRIPTION_MODEL,
      fallbackUsed: false, transcriptionMs: 100, completedAt: "2026-09-14T00:00:00.000Z",
    }));
    const afterRunner = new SafeSttModelBenchmarkRunner(request);
    const beforeRunner = new SafeSttModelBenchmarkRunner(request);
    let completed: SafeSttModelBenchmark | null = null;
    let reviewedBeforeCompletion: SafeSttModelBenchmark | null = null;
    afterRunner.run(input, (benchmark) => { completed = benchmark; });
    beforeRunner.run({ ...input, turnId: "turn-2" }, (benchmark) => {
      reviewedBeforeCompletion = reviewSafeSttModelBenchmark(benchmark, "Habari yako leo");
    });
    await vi.waitFor(() => expect(completed).not.toBeNull());
    await vi.waitFor(() => expect(reviewedBeforeCompletion).not.toBeNull());
    if (!completed || !reviewedBeforeCompletion) throw new Error("benchmark did not complete");
    const reviewedBefore = reviewedBeforeCompletion as SafeSttModelBenchmark;
    const reviewedAfterCompletion = reviewSafeSttModelBenchmark(completed, "Habari yako leo");

    expect(reviewedBefore.results.map((item) => item.wer))
      .toEqual(reviewedAfterCompletion.results.map((item) => item.wer));
  });

  it.each([
    ["accepted_primary", "Habari yako leo"],
    ["accepted_secondary", "Habari yako leo"],
    ["equivalent", "Habari yako leo"],
    ["corrected", "Habari yako leo"],
  ] as const)("applies same-audio %s review as the common model ground truth", (status, groundTruth) => {
    const benchmark: SafeSttModelBenchmark = {
      benchmarkId: "b", turnId: "turn", benchmarkVersion: "safe-stt-model-benchmark-v1",
      sameAudio: true, languageMode: "sw", resolvedSourceLanguage: "sw",
      recordingDurationMs: 500, audioMimeType: "audio/webm", groundTruthTranscript: null,
      reviewedAt: null,
      results: [{ requestedModel: PRIMARY_TRANSCRIPTION_MODEL, actualModel: PRIMARY_TRANSCRIPTION_MODEL,
        transcript: "Habari ya leo", transcriptionMs: 80, completedAt: null, outcome: "completed",
        failureCategory: null, failureReason: null, fallbackUsed: false,
        normalizedExactMatch: null, wer: null }],
    };
    const comparison: Pick<SameAudioBenchmarkComparison, "groundTruthStatus" | "groundTruthTranscript"> = {
      groundTruthStatus: status, groundTruthTranscript: groundTruth,
    };
    expect(applySameAudioGroundTruthToSafeSttModelBenchmark(benchmark, comparison))
      .toMatchObject({ groundTruthTranscript: groundTruth, reviewedAt: expect.any(String) });
  });

  it("does not create model ground truth for an uncertain same-audio review", () => {
    const benchmark: SafeSttModelBenchmark = {
      benchmarkId: "b", turnId: "turn", benchmarkVersion: "safe-stt-model-benchmark-v1",
      sameAudio: true, languageMode: "sw", resolvedSourceLanguage: "sw",
      recordingDurationMs: 500, audioMimeType: "audio/webm", groundTruthTranscript: null,
      reviewedAt: null, results: [],
    };
    expect(applySameAudioGroundTruthToSafeSttModelBenchmark(benchmark, {
      groundTruthStatus: "uncertain", groundTruthTranscript: null,
    })).toBe(benchmark);
  });
});
