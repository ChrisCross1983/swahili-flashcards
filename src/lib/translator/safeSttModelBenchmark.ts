import type { TranslationLanguage, TranslationRequestDirection } from "@/lib/translator/types";
import type { TranslatorTurnConsent } from "@/lib/translator/turnConsent";
import { speechAudioEligibleForTurn } from "@/lib/translator/turnConsent";
import {
  normalizeTranscriptForComparison,
  wordErrorRate,
  type SameAudioBenchmarkComparison,
} from "@/lib/translator/speechQuality";
import {
  SAFE_STT_MODEL_BENCHMARK_MODELS,
  SAFE_STT_MODEL_QUALITY_BENCHMARK_MODELS,
} from "@/lib/translator/server/models";
import {
  requestAudioTranscriptionBenchmark,
  type AudioTranscriptionBenchmarkResult,
} from "@/lib/translator/client";
import type { RecordedAudioDiagnostics } from "@/lib/translator/recordedAudio";
import { TranslatorOperationError } from "@/lib/translator/reliability";

export const SAFE_STT_MODEL_BENCHMARK_VERSION = "safe-stt-model-benchmark-v1";

export type SafeSttModelBenchmarkResult = {
  requestedModel: string;
  actualModel: string | null;
  transcript: string | null;
  transcriptionMs: number | null;
  completedAt: string | null;
  outcome: "completed" | "unavailable" | "runtime_failed";
  failureCategory: "model_unavailable" | "transcription_failed" | null;
  failureReason: string | null;
  fallbackUsed: false;
  normalizedExactMatch: boolean | null;
  wer: number | null;
};

export type SafeSttModelBenchmark = {
  benchmarkId: string;
  turnId: string;
  benchmarkVersion: typeof SAFE_STT_MODEL_BENCHMARK_VERSION;
  sameAudio: true;
  languageMode: "auto" | "sw" | "de";
  resolvedSourceLanguage: TranslationLanguage;
  recordingDurationMs: number | null;
  audioMimeType: string | null;
  groundTruthTranscript: string | null;
  reviewedAt: string | null;
  results: SafeSttModelBenchmarkResult[];
};

type BenchmarkInput = {
  turnId: string;
  audioBlob: Blob;
  direction: TranslationRequestDirection;
  resolvedSourceLanguage: TranslationLanguage;
  recordingDurationMs: number | null;
  consent: TranslatorTurnConsent;
  internalQaEnabled: boolean;
  recordedAudioDiagnostics?: RecordedAudioDiagnostics;
};

type Request = (
  audio: Blob,
  direction: TranslationRequestDirection,
  options: { benchmarkModel?: string; recordedAudioDiagnostics?: RecordedAudioDiagnostics },
) => Promise<AudioTranscriptionBenchmarkResult>;

function benchmarkId(turnId: string) {
  return globalThis.crypto?.randomUUID?.() ?? `safe-stt-model-${turnId}-${Date.now()}`;
}

function failed(requestedModel: string, error: unknown): SafeSttModelBenchmarkResult {
  const code = error instanceof TranslatorOperationError ? error.failure.apiErrorCode : null;
  const unavailable = code === "benchmark_model_unavailable";
  return {
    requestedModel, actualModel: null, transcript: null, transcriptionMs: null,
    completedAt: new Date().toISOString(),
    outcome: unavailable ? "unavailable" : "runtime_failed",
    failureCategory: unavailable ? "model_unavailable" : "transcription_failed",
    failureReason: code ?? "benchmark_request_failed", fallbackUsed: false,
    normalizedExactMatch: null, wer: null,
  };
}

export function reviewSafeSttModelBenchmark(
  benchmark: SafeSttModelBenchmark,
  groundTruthTranscript: string,
  reviewedAt = new Date().toISOString(),
): SafeSttModelBenchmark {
  const groundTruth = groundTruthTranscript.trim();
  if (!groundTruth) return benchmark;
  const normalized = normalizeTranscriptForComparison(groundTruth);
  return {
    ...benchmark,
    groundTruthTranscript: groundTruth,
    reviewedAt,
    results: benchmark.results.map((result) => result.transcript === null ? result : {
      ...result,
      normalizedExactMatch: normalizeTranscriptForComparison(result.transcript) === normalized,
      wer: wordErrorRate(result.transcript, groundTruth),
    }),
  };
}

/** Applies the common ground truth from the same-audio review UI to the
 * independent model-quality benchmark. Unreviewed/uncertain comparisons do
 * not provide evaluation ground truth. */
export function applySameAudioGroundTruthToSafeSttModelBenchmark(
  benchmark: SafeSttModelBenchmark,
  comparison: Pick<SameAudioBenchmarkComparison, "groundTruthStatus" | "groundTruthTranscript">,
) {
  if (
    comparison.groundTruthStatus === "unreviewed" ||
    comparison.groundTruthStatus === "uncertain" ||
    !comparison.groundTruthTranscript?.trim()
  ) {
    return benchmark;
  }
  return reviewSafeSttModelBenchmark(benchmark, comparison.groundTruthTranscript);
}

export class SafeSttModelBenchmarkRunner {
  private readonly claimedTurns = new Set<string>();

  constructor(private readonly request: Request = requestAudioTranscriptionBenchmark) {}

  isEligible(input: BenchmarkInput) {
    return input.internalQaEnabled && input.audioBlob.size > 0 &&
      input.consent.consentAtRecordingStart.internalSpeechDiagnosticsEnabled &&
      input.consent.consentAtTurnFinalization?.internalSpeechDiagnosticsEnabled === true &&
      speechAudioEligibleForTurn(input.consent);
  }

  run(input: BenchmarkInput, onComplete: (benchmark: SafeSttModelBenchmark) => void) {
    if (!this.isEligible(input) || this.claimedTurns.has(input.turnId)) return false;
    this.claimedTurns.add(input.turnId);
    const models = SAFE_STT_MODEL_QUALITY_BENCHMARK_MODELS;
    void Promise.all(models.map(async (model) => {
      try {
        const result = await this.request(input.audioBlob, input.direction, {
          benchmarkModel: model,
          recordedAudioDiagnostics: input.recordedAudioDiagnostics,
        });
        return {
          requestedModel: model, actualModel: result.model, transcript: result.transcript,
          transcriptionMs: result.transcriptionMs, completedAt: result.completedAt,
          outcome: "completed" as const, failureCategory: null, failureReason: null,
          fallbackUsed: false as const,
          normalizedExactMatch: null, wer: null,
        };
      } catch (error) {
        return failed(model, error);
      }
    })).then((results) => onComplete({
      benchmarkId: benchmarkId(input.turnId), turnId: input.turnId,
      benchmarkVersion: SAFE_STT_MODEL_BENCHMARK_VERSION, sameAudio: true,
      languageMode: input.direction.sourceLanguage,
      resolvedSourceLanguage: input.resolvedSourceLanguage,
      recordingDurationMs: input.recordingDurationMs,
      audioMimeType: input.audioBlob.type || null,
      groundTruthTranscript: null, reviewedAt: null, results,
    }));
    return true;
  }

  reset() { this.claimedTurns.clear(); }
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function percentile90(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.9) - 1];
}

export function summarizeSafeSttModelBenchmarks(benchmarks: readonly SafeSttModelBenchmark[]) {
  return SAFE_STT_MODEL_BENCHMARK_MODELS.map((model) => {
    const reviewed: Array<{
      benchmark: SafeSttModelBenchmark;
      result: SafeSttModelBenchmarkResult;
    }> = [];
    for (const benchmark of benchmarks) {
      const result = benchmark.results.find((item) => item.requestedModel === model);
      if (benchmark.groundTruthTranscript && result && result.wer !== null) {
        reviewed.push({ benchmark, result });
      }
    }
    const latencies = reviewed.map(({ result }) => result.transcriptionMs).filter((value): value is number => value !== null);
    const wers = reviewed.map(({ result }) => result.wer as number);
    const exact = reviewed.filter(({ result }) => result.normalizedExactMatch).length;
    const sw = reviewed.filter(({ benchmark }) => benchmark.resolvedSourceLanguage === "sw");
    const shortSw = sw.filter(({ benchmark }) => (benchmark.groundTruthTranscript ?? "").trim().split(/\s+/).filter(Boolean).length <= 6);
    const de = reviewed.filter(({ benchmark }) => benchmark.resolvedSourceLanguage === "de");
    const modelResults = benchmarks.flatMap((benchmark) => benchmark.results)
      .filter((result) => result.requestedModel === model);
    const completedSamples = modelResults.filter((result) => result.outcome === "completed").length;
    const unavailableFailures = modelResults.filter((result) => result.outcome === "unavailable").length;
    const runtimeFailures = modelResults.filter((result) => result.outcome === "runtime_failed").length;
    return {
      model,
      completedSamples,
      unavailableFailures,
      runtimeFailures,
      reviewedSamples: reviewed.length,
      normalizedExactMatchRate: reviewed.length ? exact / reviewed.length : null,
      meanWer: average(wers), medianWer: median(wers), medianTranscriptionMs: median(latencies), p90TranscriptionMs: percentile90(latencies),
      kiswahiliReviewedSamples: sw.length,
      kiswahiliExactMatchRate: sw.length ? sw.filter(({ result }) => result.normalizedExactMatch).length / sw.length : null,
      kiswahiliMeanWer: average(sw.map(({ result }) => result.wer as number)),
      shortKiswahiliReviewedSamples: shortSw.length,
      shortKiswahiliMeanWer: average(shortSw.map(({ result }) => result.wer as number)),
      germanReviewedSamples: de.length,
      germanMeanWer: average(de.map(({ result }) => result.wer as number)),
      accessOrRuntimeFailures: unavailableFailures + runtimeFailures,
    };
  });
}
