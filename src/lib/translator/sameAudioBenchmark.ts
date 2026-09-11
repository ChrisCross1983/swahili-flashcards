import type { TranslationRequestDirection } from "@/lib/translator/types";
import type { TranslatorTurnConsent } from "@/lib/translator/turnConsent";
import { speechAudioEligibleForTurn } from "@/lib/translator/turnConsent";
import type { SameAudioBenchmarkComparison } from "@/lib/translator/speechQuality";
import {
  requestAudioTranscriptionBenchmark,
  type AudioTranscriptionBenchmarkResult,
} from "@/lib/translator/client";
import type { RecordedAudioDiagnostics } from "@/lib/translator/recordedAudio";

type BenchmarkInput = {
  turnId: string;
  audioBlob: Blob;
  primaryTranscript: string;
  primaryCompletedAt: string;
  primaryEngine: string;
  primaryRoute: "realtime";
  direction: TranslationRequestDirection;
  recordingDurationMs: number | null;
  consent: TranslatorTurnConsent;
  internalQaEnabled: boolean;
  recordedAudioDiagnostics?: RecordedAudioDiagnostics;
};

type RequestBenchmark = (
  audioBlob: Blob,
  direction: TranslationRequestDirection,
  options: { signal: AbortSignal; recordedAudioDiagnostics?: RecordedAudioDiagnostics },
) => Promise<AudioTranscriptionBenchmarkResult>;

function comparisonId(turnId: string) {
  return globalThis.crypto?.randomUUID?.() ?? `comparison-${turnId}-${Date.now()}`;
}

export class SameAudioBenchmarkRunner {
  private readonly claimedTurns = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private generation = 0;

  constructor(private readonly request: RequestBenchmark = requestAudioTranscriptionBenchmark) {}

  isEligible(input: BenchmarkInput) {
    return input.internalQaEnabled &&
      input.primaryRoute === "realtime" &&
      input.primaryTranscript.trim().length > 0 &&
      input.audioBlob.size > 0 &&
      input.consent.consentAtRecordingStart.internalSpeechDiagnosticsEnabled &&
      input.consent.consentAtTurnFinalization?.internalSpeechDiagnosticsEnabled === true &&
      speechAudioEligibleForTurn(input.consent);
  }

  run(
    input: BenchmarkInput,
    onUpdate: (comparison: SameAudioBenchmarkComparison) => void,
  ) {
    if (!this.isEligible(input) || this.claimedTurns.has(input.turnId)) return false;
    this.claimedTurns.add(input.turnId);
    const runGeneration = this.generation;
    const controller = new AbortController();
    this.controllers.set(input.turnId, controller);
    const pending: SameAudioBenchmarkComparison = {
      comparisonId: comparisonId(input.turnId),
      turnId: input.turnId,
      primaryEngine: input.primaryEngine,
      secondaryEngine: "gpt-4o-mini-transcribe",
      primaryTranscript: input.primaryTranscript,
      secondaryTranscript: null,
      primaryCompletedAt: input.primaryCompletedAt,
      secondaryCompletedAt: null,
      sameAudio: true,
      recordingDurationMs: input.recordingDurationMs,
      primaryRoute: "realtime",
      secondaryRoute: "audio_upload_fallback",
      groundTruthStatus: "unreviewed",
      groundTruthTranscript: null,
      reviewedAt: null,
      benchmarkStatus: "pending",
      benchmarkFailure: null,
      secondaryTranscriptionMs: null,
      primaryNormalizedExactMatch: null,
      secondaryNormalizedExactMatch: null,
      primaryWer: null,
      secondaryWer: null,
    };
    onUpdate(pending);
    void this.request(input.audioBlob, input.direction, {
      signal: controller.signal,
      recordedAudioDiagnostics: input.recordedAudioDiagnostics,
    }).then((result) => {
      if (controller.signal.aborted || runGeneration !== this.generation) return;
      onUpdate({
        ...pending,
        secondaryEngine: result.model,
        secondaryTranscript: result.transcript,
        secondaryCompletedAt: result.completedAt,
        secondaryTranscriptionMs: result.transcriptionMs,
        benchmarkStatus: "completed",
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || runGeneration !== this.generation) return;
      onUpdate({
        ...pending,
        secondaryCompletedAt: new Date().toISOString(),
        benchmarkStatus: "failed",
        benchmarkFailure: error instanceof Error ? error.message : "benchmark_transcription_failed",
      });
    }).finally(() => {
      if (this.controllers.get(input.turnId) === controller) {
        this.controllers.delete(input.turnId);
      }
    });
    return true;
  }

  cancelTurn(turnId: string) {
    this.controllers.get(turnId)?.abort();
    this.controllers.delete(turnId);
  }

  reset() {
    this.generation += 1;
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    this.claimedTurns.clear();
  }
}
