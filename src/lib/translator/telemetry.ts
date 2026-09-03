import type { TranslatorBuildMetadata, TranslatorPlatformMetadata } from "@/lib/translator/diagnosticMetadata";
import type {
  TranslatorFailureCategory,
  TranslatorRecoveryAction,
} from "@/lib/translator/reliability";
import type { TranslationLanguage, TranslationMode, TranscriptionPath } from "@/lib/translator/types";
import type {
  TranslatorDiagnosticEvent,
  TranslatorDiagnosticEventKind,
  TranslatorDiagnosticEventOrigin,
} from "@/lib/translator/diagnosticEvents";
import type { TranslatorConsentSnapshot } from "@/lib/translator/turnConsent";

export type TranslatorTechnicalEvent = TranslatorBuildMetadata &
  TranslatorPlatformMetadata & {
    installationId: string;
    sessionId: string;
    turnId: string;
    timestamp: string;
    translatorMode: TranslationMode;
    sourceLanguage: TranslationLanguage | null;
    targetLanguage: TranslationLanguage | null;
    transcriptionPath: TranscriptionPath | null;
    transcriptionModel: string | null;
    translationModel: string;
    ttsModel: string;
    warmStart: boolean;
    realtimeConnectionReused: boolean;
    fallbackReason: string | null;
    recordClickToRecordingStartedMs: number | null;
    stopToTranscriptFinalMs: number | null;
    transcriptFinalToTranslationVisibleMs: number | null;
    stopToPlaybackStartedMs: number | null;
    translationServerPreOpenAiMs: number | null;
    translationAuthMs: number | null;
    translationOpenAiTotalMs: number | null;
    ttsServerPreOpenAiMs: number | null;
    ttsAuthMs: number | null;
    ttsOpenAiTimeToFirstByteMs: number | null;
    ttsOpenAiTotalMs: number | null;
    status: "success" | "failure";
    failureCategory: TranslatorFailureCategory | null;
    httpStatus: number | null;
    apiErrorCode: string | null;
    errorStage: string | null;
    retryable: boolean;
    recoveryAction: TranslatorRecoveryAction;
    recoverySucceeded: boolean | null;
    eventOrigin: TranslatorDiagnosticEventOrigin | null;
    eventKind: TranslatorDiagnosticEventKind | null;
    qaScenarioId: string | null;
    diagnosticEvents: TranslatorDiagnosticEvent[];
    consentAtRecordingStart: TranslatorConsentSnapshot | null;
    consentAtTurnFinalization: TranslatorConsentSnapshot | null;
  };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type TelemetryQueueOptions = {
  storage: StorageLike;
  fetcher?: typeof fetch;
  isEnabled: () => boolean;
  schedule?: (callback: () => void) => void;
  maxEvents?: number;
  batchSize?: number;
};

const QUEUE_KEY = "translator-technical-telemetry-queue-v1";

export const REMOTE_TRANSLATOR_TELEMETRY_ENABLED =
  process.env.NEXT_PUBLIC_TRANSLATOR_REMOTE_DIAGNOSTICS_ENABLED === "true";

function readQueue(storage: StorageLike): TranslatorTechnicalEvent[] {
  try {
    const parsed = JSON.parse(storage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class TranslatorTelemetryQueue {
  private flushing = false;
  private readonly fetcher: typeof fetch;
  private readonly schedule: (callback: () => void) => void;
  private readonly maxEvents: number;
  private readonly batchSize: number;

  constructor(private readonly options: TelemetryQueueOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.schedule = options.schedule ?? ((callback) => setTimeout(callback, 0));
    this.maxEvents = options.maxEvents ?? 100;
    this.batchSize = options.batchSize ?? 10;
  }

  enqueue(event: TranslatorTechnicalEvent) {
    if (!this.options.isEnabled()) return false;
    const queue = [
      ...readQueue(this.options.storage).filter((current) =>
        current.sessionId !== event.sessionId || current.turnId !== event.turnId,
      ),
      event,
    ].slice(-this.maxEvents);
    this.options.storage.setItem(QUEUE_KEY, JSON.stringify(queue));
    this.schedule(() => void this.flush());
    return true;
  }

  disable() {
    this.options.storage.removeItem(QUEUE_KEY);
  }

  pendingCount() {
    return readQueue(this.options.storage).length;
  }

  async flush() {
    if (this.flushing || !this.options.isEnabled()) return;
    const queue = readQueue(this.options.storage);
    if (queue.length === 0) return;
    this.flushing = true;
    const batch = queue.slice(0, this.batchSize);
    try {
      const response = await this.fetcher("/api/translator/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
      if (!response.ok) return;
      const remaining = readQueue(this.options.storage).slice(batch.length);
      if (remaining.length === 0) this.options.storage.removeItem(QUEUE_KEY);
      else this.options.storage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    } catch {
      // Telemetry is deliberately non-critical. Keep the bounded queue for later.
    } finally {
      this.flushing = false;
    }
  }
}
