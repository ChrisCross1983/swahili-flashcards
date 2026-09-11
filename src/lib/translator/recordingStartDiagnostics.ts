export const RECORDING_START_OPERATION_TIMEOUT_MS = 14_000;
export const RECORDING_START_STUCK_THRESHOLD_MS = 12_000;

export type RecordingStartPhase =
  | "user_click"
  | "start_operation_started"
  | "microphone_acquisition_requested"
  | "microphone_acquired"
  | "recorder_prepare_started"
  | "recorder_prepared"
  | "realtime_rebind_started"
  | "realtime_rebind_completed"
  | "recording_start_called"
  | "recording_started"
  | "timeout"
  | "cleanup_completed"
  | "stale_start_result_discarded";

export type RecordingStartOutcome =
  | "recording_started"
  | "timeout"
  | "permission_denied"
  | "device_unavailable"
  | "aborted"
  | "superseded"
  | "stale_completion"
  | "unknown_failure";

export type RecordingStartRecorderSnapshot = {
  recorderStatus: string;
  microphoneAcquisitionState: string;
  hasPendingAcquisition: boolean;
  recordingStartInFlight: boolean;
  captureGeneration: number | null;
};

export type RecordingStartPhaseEvent = RecordingStartRecorderSnapshot & {
  phase: RecordingStartPhase;
  at: string;
};

export type RecordingStartAttempt = {
  attemptId: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  currentPhase: RecordingStartPhase;
  outcome: RecordingStartOutcome | null;
  timeline: RecordingStartPhaseEvent[];
} & RecordingStartRecorderSnapshot;

type TrackerDependencies = {
  now?: () => number;
  isoNow?: () => string;
  id?: () => string;
};

export class RecordingStartDiagnosticsTracker {
  private readonly now: () => number;
  private readonly isoNow: () => string;
  private readonly id: () => string;
  private readonly monotonicStartedAt = new Map<string, number>();
  private attempts: RecordingStartAttempt[] = [];
  private activeAttemptId: string | null = null;

  constructor(dependencies: TrackerDependencies = {}) {
    this.now = dependencies.now ?? (() => performance.now());
    this.isoNow = dependencies.isoNow ?? (() => new Date().toISOString());
    this.id = dependencies.id ?? (() =>
      globalThis.crypto?.randomUUID?.() ?? `recording-start-${Date.now()}`);
  }

  begin(snapshot: RecordingStartRecorderSnapshot) {
    if (this.activeAttemptId) {
      this.complete(this.activeAttemptId, "superseded", snapshot);
    }
    const attemptId = this.id();
    const startedAt = this.isoNow();
    this.monotonicStartedAt.set(attemptId, this.now());
    const event = { phase: "user_click" as const, at: startedAt, ...snapshot };
    const attempt: RecordingStartAttempt = {
      attemptId,
      startedAt,
      completedAt: null,
      durationMs: null,
      currentPhase: event.phase,
      outcome: null,
      timeline: [event],
      ...snapshot,
    };
    this.attempts.push(attempt);
    this.activeAttemptId = attemptId;
    return attemptId;
  }

  mark(
    attemptId: string,
    phase: RecordingStartPhase,
    snapshot: RecordingStartRecorderSnapshot,
  ) {
    const attempt = this.attempts.find((item) => item.attemptId === attemptId);
    const postStartRealtimePhase = attempt?.outcome === "recording_started" &&
      (phase === "realtime_rebind_started" || phase === "realtime_rebind_completed");
    if (!attempt || (attempt.outcome && !postStartRealtimePhase)) return false;
    const event = { phase, at: this.isoNow(), ...snapshot };
    Object.assign(attempt, snapshot, { currentPhase: phase });
    attempt.timeline.push(event);
    return true;
  }

  markLateCompletion(
    attemptId: string,
    snapshot: RecordingStartRecorderSnapshot,
  ) {
    const attempt = this.attempts.find((item) => item.attemptId === attemptId);
    if (!attempt) return false;
    const event = {
      phase: "stale_start_result_discarded" as const,
      at: this.isoNow(),
      ...snapshot,
    };
    attempt.timeline.push(event);
    return true;
  }

  complete(
    attemptId: string,
    outcome: RecordingStartOutcome,
    snapshot: RecordingStartRecorderSnapshot,
  ) {
    const attempt = this.attempts.find((item) => item.attemptId === attemptId);
    if (!attempt || attempt.outcome) return false;
    const completedAt = this.isoNow();
    const started = this.monotonicStartedAt.get(attemptId);
    Object.assign(attempt, snapshot, {
      completedAt,
      durationMs: started === undefined
        ? Math.max(0, Date.parse(completedAt) - Date.parse(attempt.startedAt))
        : Math.max(0, Math.round(this.now() - started)),
      outcome,
    });
    if (this.activeAttemptId === attemptId) this.activeAttemptId = null;
    this.monotonicStartedAt.delete(attemptId);
    return true;
  }

  getAttempts() {
    return this.attempts.map((attempt) => ({
      ...attempt,
      timeline: attempt.timeline.map((event) => ({ ...event })),
    }));
  }

  getActiveAttempt(): (RecordingStartAttempt & { ageMs: number }) | null {
    const attempt = this.attempts.find((item) =>
      item.attemptId === this.activeAttemptId && !item.outcome);
    if (!attempt) return null;
    const started = this.monotonicStartedAt.get(attempt.attemptId);
    return {
      ...attempt,
      timeline: attempt.timeline.map((event) => ({ ...event })),
      ageMs: started === undefined
        ? Math.max(0, Date.now() - Date.parse(attempt.startedAt))
        : Math.max(0, Math.round(this.now() - started)),
    };
  }

  reset() {
    this.attempts = [];
    this.activeAttemptId = null;
    this.monotonicStartedAt.clear();
  }
}

export class RecordingStartOperationTimeoutError extends Error {
  constructor() {
    super("recording_start_operation_timeout");
    this.name = "RecordingStartOperationTimeoutError";
  }
}

export function withRecordingStartOperationWatchdog<T>(
  operation: Promise<T>,
  options: {
    timeoutMs?: number;
    onTimeout?: () => void;
    setTimer?: typeof setTimeout;
    clearTimer?: typeof clearTimeout;
  } = {},
) {
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimer(() => {
      options.onTimeout?.();
      reject(new RecordingStartOperationTimeoutError());
    }, options.timeoutMs ?? RECORDING_START_OPERATION_TIMEOUT_MS);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimer(timer));
}

export function recordingStartOutcomeForError(error: unknown): RecordingStartOutcome {
  if (error instanceof RecordingStartOperationTimeoutError) return "timeout";
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
  if (code.includes("timeout")) return "timeout";
  if (code.includes("permission") || code.includes("not_allowed")) {
    return "permission_denied";
  }
  if (code.includes("device") || code.includes("not_found")) {
    return "device_unavailable";
  }
  if (code.includes("aborted")) return "aborted";
  if (code.includes("stale")) return "stale_completion";
  const name = error instanceof Error ? error.name : "";
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) {
    return "permission_denied";
  }
  if (["NotFoundError", "DevicesNotFoundError", "NotReadableError"].includes(name)) {
    return "device_unavailable";
  }
  return "unknown_failure";
}
