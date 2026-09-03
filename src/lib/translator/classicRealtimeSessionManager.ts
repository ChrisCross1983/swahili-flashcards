import type {
  ClassicRealtimeTranscriptionResult,
  ClassicTranscriptionFallbackReason,
} from "@/lib/translator/classicRealtimeTranscription";
import type { RealtimeTranscriptionDiagnosticEvent } from "@/lib/translator/live/v2/realtimeTranscriptionClient";
import type { TranscriptionPath } from "@/lib/translator/types";

export const CLASSIC_REALTIME_IDLE_TTL_MS = 120_000;
export const CLASSIC_REALTIME_RECONNECT_DELAY_MS = 1_000;
export const CLASSIC_REALTIME_FINAL_TIMEOUT_MS = 3_000;
export const CLASSIC_REALTIME_FINALIZATION_FAILURE_THRESHOLD = 2;
export const CLASSIC_REALTIME_CIRCUIT_BREAKER_TURNS = 2;

export type ClassicRealtimeSessionState =
  | "idle"
  | "connecting"
  | "ready"
  | "recording"
  | "finalizing"
  | "reconnecting"
  | "closed"
  | "failed";

export type ClassicRealtimeConnectionReason =
  | "initial_background_warm"
  | "reconnect"
  | "idle_restart";

export type ClassicRealtimeConnectionAttempt = {
  connectionAttemptId: string;
  connectionId: string;
  reason: ClassicRealtimeConnectionReason;
  startedAt: string;
  endedAt: string | null;
  status: "connecting" | "success" | "failed" | "cancelled";
  sessionRequestStartedAt: string | null;
  sessionResponseAt: string | null;
  sessionRouteMs: number | null;
  peerConnectionCreatedAt: string | null;
  offerCreatedAt: string | null;
  sdpRequestStartedAt: string | null;
  sdpResponseAt: string | null;
  sdpHttpStatus: number | null;
  sdpRequestId: string | null;
  sdpMs: number | null;
  remoteDescriptionSetAt: string | null;
  dataChannelOpenedAt: string | null;
  connectionReadyAt: string | null;
  totalSetupMs: number | null;
  errorStage: string | null;
  errorType: string | null;
  errorCode: string | null;
  sanitizedErrorMessage: string | null;
};

type RealtimeTransport = {
  connect: (stream: MediaStream, captureGeneration?: number) => Promise<void>;
  finalizeTurn: () => Promise<string>;
  clearTurn: () => void;
  setInputEnabled: (enabled: boolean) => Promise<void>;
  replaceInputStream: (stream: MediaStream, captureGeneration: number) => Promise<void>;
  disconnect: (reason?: string) => void;
};

type RealtimeTransportHandlers = {
  onDelta: (delta: string) => void;
  onError: () => void;
  onDiagnosticEvent?: (event: RealtimeTranscriptionDiagnosticEvent) => void;
};

type ManagerDependencies = {
  createTransport: (handlers: RealtimeTransportHandlers) => RealtimeTransport;
  releaseMicrophone: () => void;
  now?: () => number;
  wallNow?: () => number;
  randomId?: () => string;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  idleTtlMs?: number;
  reconnectDelayMs?: number;
  finalTimeoutMs?: number;
  realtimeEnabled?: boolean;
  finalizationFailureThreshold?: number;
  circuitBreakerTurns?: number;
};

export type ClassicRealtimeTurnHandle = {
  turnToken: string;
  transcriptionPath: TranscriptionPath;
  fallbackReason: ClassicTranscriptionFallbackReason | null;
  transcriptionPathDecisionAt: string;
  transcriptionPathDecisionReason:
    | "warm_realtime_ready"
    | "realtime_not_ready_at_recording_start"
    | "realtime_temporarily_bypassed";
  connectionId: string | null;
  realtimeConnectionReadyAtRecordingStart: string | null;
  realtimeConnectionReused: boolean;
  realtimeConnectionAgeAtRecordingStartMs: number | null;
  warmStart: boolean;
  connectionLostDuringRecording: boolean;
  onFirstDelta?: () => void;
  firstDeltaSeen: boolean;
  backgroundConnectionAttemptId: string | null;
  realtimeSetupMs: number | null;
  realtimeTransportReady: boolean;
  realtimeInputTrackGeneration: number | null;
  realtimeInputTrackBound: boolean;
  circuitBreakerBypassed: boolean;
  activationPromise: Promise<void> | null;
};

type InternalAttempt = ClassicRealtimeConnectionAttempt & {
  startedMonotonic: number;
};

function hasTranscriptContent(text: string) {
  return /[\p{L}\p{N}]/u.test(text);
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Realtime connection failed";
  return message.slice(0, 500);
}

function diagnosticDuration(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

export class ClassicRealtimeSessionManager {
  private state: ClassicRealtimeSessionState = "idle";
  private transport: RealtimeTransport | null = null;
  private connectionPromise: Promise<void> | null = null;
  private stream: MediaStream | null = null;
  private captureGeneration = 0;
  private activeTurn: ClassicRealtimeTurnHandle | null = null;
  private connectionId: string | null = null;
  private connectionReadyAt: string | null = null;
  private connectionReadyMonotonic: number | null = null;
  private connectionGeneration = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts: InternalAttempt[] = [];
  private reconnectCount = 0;
  private lastCloseReason: string | null = null;
  private disposed = false;
  private consecutiveFinalizationFailures = 0;
  private finalizationFailureCount = 0;
  private circuitBreakerTurnsRemaining = 0;
  private circuitBreakerTrips = 0;

  constructor(private readonly dependencies: ManagerDependencies) {}

  getState() {
    return this.state;
  }

  async prepareTurn(
    stream: MediaStream,
    onFirstDelta?: () => void,
  ): Promise<ClassicRealtimeTurnHandle> {
    if (this.disposed) throw new Error("classic_realtime_manager_closed");
    if (this.activeTurn) throw new Error("classic_realtime_turn_already_active");
    this.cancelIdleTimer();
    this.stream = stream;
    const decisionAt = this.isoNow();
    const realtimeEnabled = this.dependencies.realtimeEnabled !== false;
    const circuitBreakerBypassed = this.circuitBreakerTurnsRemaining > 0;
    const ready = realtimeEnabled && !circuitBreakerBypassed &&
      this.state === "ready" && Boolean(this.transport && this.connectionId);
    const fallbackReason: ClassicTranscriptionFallbackReason | null = ready
      ? null
      : !realtimeEnabled
        ? "realtime_disabled"
        : circuitBreakerBypassed
          ? "realtime_circuit_breaker"
          : "realtime_not_ready_at_recording_start";
    const connectionAge =
      ready && this.connectionReadyMonotonic !== null
        ? this.now() - this.connectionReadyMonotonic
        : null;
    const handle: ClassicRealtimeTurnHandle = {
      turnToken: this.id(),
      transcriptionPath: ready ? "realtime" : "audio_upload_fallback",
      fallbackReason,
      transcriptionPathDecisionAt: decisionAt,
      transcriptionPathDecisionReason: ready
        ? "warm_realtime_ready"
        : circuitBreakerBypassed || !realtimeEnabled
          ? "realtime_temporarily_bypassed"
          : "realtime_not_ready_at_recording_start",
      connectionId: ready ? this.connectionId : null,
      realtimeConnectionReadyAtRecordingStart: ready
        ? this.connectionReadyAt
        : null,
      realtimeConnectionReused: ready,
      realtimeConnectionAgeAtRecordingStartMs:
        connectionAge !== null && connectionAge >= 0
          ? Math.round(connectionAge)
          : null,
      warmStart: ready,
      connectionLostDuringRecording: false,
      onFirstDelta,
      firstDeltaSeen: false,
      backgroundConnectionAttemptId: null,
      // Warm turns reuse an existing connection; its one-time setup cost belongs
      // to the connection attempt, not to every subsequent turn.
      realtimeSetupMs: null,
      realtimeTransportReady: ready,
      realtimeInputTrackGeneration: null,
      realtimeInputTrackBound: false,
      circuitBreakerBypassed,
      activationPromise: null,
    };
    this.activeTurn = handle;
    this.state = "recording";

    if (ready) this.transport?.clearTurn();
    return handle;
  }

  recordingStarted(
    handle: ClassicRealtimeTurnHandle,
    stream: MediaStream,
    captureGeneration = 0,
  ) {
    this.assertActive(handle);
    if (handle.activationPromise) return handle.activationPromise;
    this.stream = stream;
    this.captureGeneration = captureGeneration;
    if (handle.transcriptionPath === "realtime") {
      const transport = this.transport;
      handle.activationPromise = (async () => {
        try {
          if (!transport || transport !== this.transport) {
            throw new Error("transcription_transport_unavailable");
          }
          await transport.replaceInputStream(stream, captureGeneration);
          handle.realtimeInputTrackGeneration = captureGeneration;
          handle.realtimeInputTrackBound = true;
          await transport.setInputEnabled(true);
        } catch {
          handle.transcriptionPath = "audio_upload_fallback";
          handle.fallbackReason = "realtime_track_rebind_failed";
          handle.transcriptionPathDecisionReason = "realtime_temporarily_bypassed";
          handle.connectionLostDuringRecording = true;
          this.invalidateConnection("classic_turn_track_rebind_failed", true);
        }
      })();
      return handle.activationPromise;
    }
    if (handle.transcriptionPath === "audio_upload_fallback") {
      if (!handle.circuitBreakerBypassed && this.dependencies.realtimeEnabled !== false) {
        const connectingAttempt = [...this.attempts]
          .reverse()
          .find((attempt) => attempt.status === "connecting");
        if (connectingAttempt) {
          handle.backgroundConnectionAttemptId =
            connectingAttempt.connectionAttemptId;
        }
        void this.ensureConnected(this.connectionReason()).catch(() => undefined);
      }
    }
    handle.activationPromise = Promise.resolve();
    return handle.activationPromise;
  }

  async abortTurn(handle: ClassicRealtimeTurnHandle) {
    if (this.activeTurn !== handle) return;
    try {
      if (this.transport) {
        await this.transport.setInputEnabled(false);
        this.transport.clearTurn();
      }
    } catch {
      this.invalidateConnection("classic_turn_aborted", true);
    }
    this.activeTurn = null;
    this.state = this.transport && this.connectionId ? "ready" : "failed";
    this.scheduleIdleTimer();
  }

  async finishTurn(
    handle: ClassicRealtimeTurnHandle,
  ): Promise<ClassicRealtimeTranscriptionResult> {
    this.assertActive(handle);
    await handle.activationPromise;
    if (
      handle.transcriptionPath !== "realtime" ||
      handle.connectionLostDuringRecording ||
      !this.transport ||
      handle.connectionId !== this.connectionId
    ) {
      await this.finishFallbackTurn(handle);
      return {
        ok: false,
        fallbackReason:
          handle.connectionLostDuringRecording
            ? "connection_lost_during_recording"
            : (handle.fallbackReason ?? "realtime_not_ready_at_recording_start"),
      };
    }

    this.state = "finalizing";
    const transport = this.transport;
    try {
      await transport.setInputEnabled(false);
      const transcript = (
        await this.withTimeout(
          transport.finalizeTurn(),
          this.dependencies.finalTimeoutMs ?? CLASSIC_REALTIME_FINAL_TIMEOUT_MS,
        )
      ).trim();
      transport.clearTurn();
      this.activeTurn = null;
      this.state = "ready";
      this.scheduleIdleTimer();
      if (!transcript || !hasTranscriptContent(transcript)) {
        const tripped = this.recordFinalizationFailure();
        if (tripped) {
          this.invalidateConnection("classic_turn_empty_transcript", false);
        }
        return { ok: false, fallbackReason: "empty_transcript" };
      }
      this.consecutiveFinalizationFailures = 0;
      return { ok: true, authoritativeTranscript: transcript };
    } catch (error) {
      const fallbackReason: ClassicTranscriptionFallbackReason =
        error instanceof Error && error.message === "classic_transcript_timeout"
          ? "transcript_timeout"
          : "transcript_not_finalized";
      handle.connectionLostDuringRecording = true;
      this.activeTurn = null;
      const tripped = this.recordFinalizationFailure();
      this.invalidateConnection("classic_turn_finalization_failed", !tripped);
      this.scheduleIdleTimer();
      return { ok: false, fallbackReason };
    }
  }

  getConnectionDiagnostics() {
    const attempts = this.attempts.map((attempt) => {
      const reportAttempt: Partial<InternalAttempt> = { ...attempt };
      delete reportAttempt.startedMonotonic;
      return reportAttempt as ClassicRealtimeConnectionAttempt;
    });
    return {
      connectionAttempts: attempts,
      connectionAttemptsTotal: attempts.length,
      connectionSuccesses: attempts.filter((attempt) => attempt.status === "success").length,
      connectionFailures: attempts.filter((attempt) => attempt.status === "failed").length,
      reconnectCount: this.reconnectCount,
      realtimeFinalizationFailureCount: this.finalizationFailureCount,
      realtimeCircuitBreakerTrips: this.circuitBreakerTrips,
      realtimeCircuitBreakerTurnsRemaining: this.circuitBreakerTurnsRemaining,
    };
  }

  close(reason = "classic_manager_close") {
    if (this.disposed && this.state === "closed") return;
    this.disposed = true;
    this.lastCloseReason = reason;
    this.cancelIdleTimer();
    this.cancelReconnectTimer();
    this.connectionGeneration += 1;
    this.transport?.disconnect(reason);
    this.transport = null;
    this.connectionPromise = null;
    this.connectionId = null;
    this.connectionReadyAt = null;
    this.connectionReadyMonotonic = null;
    this.activeTurn = null;
    this.stream = null;
    this.state = "closed";
    this.markConnectingAttemptsCancelled();
    this.dependencies.releaseMicrophone();
  }

  private async finishFallbackTurn(handle: ClassicRealtimeTurnHandle) {
    if (this.activeTurn !== handle) return;
    const transport = this.transport;
    if (transport && this.connectionId) {
      try {
        await transport.setInputEnabled(false);
        transport.clearTurn();
      } catch {
        this.invalidateConnection("classic_fallback_turn_gate_failed", true);
      }
    }
    this.activeTurn = null;
    if (handle.circuitBreakerBypassed && this.circuitBreakerTurnsRemaining > 0) {
      this.circuitBreakerTurnsRemaining -= 1;
      if (this.circuitBreakerTurnsRemaining === 0 && this.dependencies.realtimeEnabled !== false) {
        void this.ensureConnected("reconnect").catch(() => undefined);
      }
    }
    this.state = this.transport && this.connectionId
      ? "ready"
      : this.connectionPromise
        ? "connecting"
        : "failed";
    this.scheduleIdleTimer();
  }

  private ensureConnected(reason: ClassicRealtimeConnectionReason) {
    if (
      this.disposed ||
      !this.stream ||
      this.dependencies.realtimeEnabled === false ||
      this.circuitBreakerTurnsRemaining > 0
    ) return Promise.resolve();
    if (this.transport && this.connectionId) return Promise.resolve();
    if (this.connectionPromise) return this.connectionPromise;
    this.cancelReconnectTimer();
    const generation = ++this.connectionGeneration;
    this.lastCloseReason = null;
    const connectionId = this.id();
    const connectionAttemptId = this.id();
    const attempt: InternalAttempt = {
      connectionAttemptId,
      connectionId,
      reason,
      startedAt: this.isoNow(),
      endedAt: null,
      status: "connecting",
      sessionRequestStartedAt: null,
      sessionResponseAt: null,
      sessionRouteMs: null,
      peerConnectionCreatedAt: null,
      offerCreatedAt: null,
      sdpRequestStartedAt: null,
      sdpResponseAt: null,
      sdpHttpStatus: null,
      sdpRequestId: null,
      sdpMs: null,
      remoteDescriptionSetAt: null,
      dataChannelOpenedAt: null,
      connectionReadyAt: null,
      totalSetupMs: null,
      errorStage: null,
      errorType: null,
      errorCode: null,
      sanitizedErrorMessage: null,
      startedMonotonic: this.now(),
    };
    this.attempts.push(attempt);
    if (this.activeTurn?.transcriptionPath === "audio_upload_fallback") {
      this.activeTurn.backgroundConnectionAttemptId = connectionAttemptId;
    }
    if (reason === "reconnect") this.reconnectCount += 1;
    this.state = this.activeTurn ? "recording" : reason === "reconnect" ? "reconnecting" : "connecting";
    const transport = this.dependencies.createTransport({
      onDelta: (delta) => this.handleDelta(generation, connectionId, delta),
      onError: () => this.handleConnectionLoss(generation),
      onDiagnosticEvent: (event) =>
        this.recordDiagnostic(generation, attempt, event),
    });
    this.transport = transport;
    const connectionStream = this.stream;
    const connectionCaptureGeneration = this.captureGeneration;
    const promise = transport.connect(connectionStream, connectionCaptureGeneration).then(async () => {
      if (!this.isCurrent(generation, transport)) return;
      if (
        this.stream &&
        (this.stream !== connectionStream ||
          this.captureGeneration !== connectionCaptureGeneration)
      ) {
        await transport.replaceInputStream(this.stream, this.captureGeneration);
      }
      this.connectionId = connectionId;
      this.connectionReadyAt = this.isoNow();
      this.connectionReadyMonotonic = this.now();
      attempt.status = "success";
      attempt.endedAt = this.connectionReadyAt;
      attempt.connectionReadyAt ??= this.connectionReadyAt;
      attempt.totalSetupMs = this.elapsedSince(attempt.startedMonotonic);
      if (
        this.activeTurn?.backgroundConnectionAttemptId === connectionAttemptId
      ) {
        this.activeTurn.realtimeSetupMs = attempt.totalSetupMs;
        this.activeTurn.realtimeTransportReady = true;
        this.activeTurn.realtimeInputTrackGeneration = this.captureGeneration;
        this.activeTurn.realtimeInputTrackBound = true;
      }

      const currentTurnUsesConnection =
        this.activeTurn?.transcriptionPath === "realtime" &&
        this.activeTurn.connectionId === connectionId;
      if (!currentTurnUsesConnection) {
        transport.clearTurn();
        await transport.setInputEnabled(false);
      }
      this.state = this.activeTurn ? "recording" : "ready";
      if (!this.activeTurn) this.scheduleIdleTimer();
    }).catch((error) => {
      if (!this.isCurrent(generation, transport)) return;
      attempt.status = "failed";
      attempt.endedAt = this.isoNow();
      attempt.totalSetupMs = this.elapsedSince(attempt.startedMonotonic);
      attempt.errorStage ??= "connection_sequence";
      attempt.errorType ??= error instanceof Error ? error.name : "UnknownError";
      attempt.errorCode ??= error instanceof Error ? error.message : "connection_failed";
      attempt.sanitizedErrorMessage ??= safeErrorMessage(error);
      this.transport = null;
      this.connectionId = null;
      this.connectionReadyAt = null;
      this.connectionReadyMonotonic = null;
      this.state = this.activeTurn ? "recording" : "failed";
      this.scheduleReconnect();
    }).finally(() => {
      if (this.connectionPromise === promise) this.connectionPromise = null;
    });
    this.connectionPromise = promise;
    return promise;
  }

  private handleDelta(generation: number, connectionId: string, delta: string) {
    if (!this.isCurrentGeneration(generation) || !delta) return;
    const turn = this.activeTurn;
    if (
      !turn ||
      turn.transcriptionPath !== "realtime" ||
      turn.connectionId !== connectionId ||
      turn.firstDeltaSeen
    ) {
      return;
    }
    turn.firstDeltaSeen = true;
    turn.onFirstDelta?.();
  }

  private handleConnectionLoss(generation: number) {
    if (!this.isCurrentGeneration(generation)) return;
    if (this.activeTurn?.transcriptionPath === "realtime") {
      this.activeTurn.connectionLostDuringRecording = true;
      this.activeTurn.fallbackReason = "connection_lost_during_recording";
    }
    this.invalidateConnection("classic_connection_lost", true);
  }

  private invalidateConnection(reason: string, reconnect: boolean) {
    this.cancelReconnectTimer();
    this.connectionGeneration += 1;
    this.transport?.disconnect(reason);
    this.transport = null;
    this.connectionPromise = null;
    this.connectionId = null;
    this.connectionReadyAt = null;
    this.connectionReadyMonotonic = null;
    this.state = this.activeTurn ? "recording" : "failed";
    if (reconnect) this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (
      this.disposed ||
      !this.stream ||
      this.reconnectTimer ||
      this.dependencies.realtimeEnabled === false ||
      this.circuitBreakerTurnsRemaining > 0
    ) return;
    const setTimer = this.dependencies.setTimer ?? setTimeout;
    this.reconnectTimer = setTimer(() => {
      this.reconnectTimer = null;
      if (this.disposed || !this.stream || this.transport) return;
      void this.ensureConnected("reconnect").catch(() => undefined);
    }, this.dependencies.reconnectDelayMs ?? CLASSIC_REALTIME_RECONNECT_DELAY_MS);
  }

  private scheduleIdleTimer() {
    if (this.disposed || this.activeTurn) return;
    this.cancelIdleTimer();
    const setTimer = this.dependencies.setTimer ?? setTimeout;
    this.idleTimer = setTimer(() => {
      this.idleTimer = null;
      this.lastCloseReason = "idle_ttl";
      this.connectionGeneration += 1;
      this.cancelReconnectTimer();
      this.transport?.disconnect("classic_idle_ttl");
      this.transport = null;
      this.connectionPromise = null;
      this.connectionId = null;
      this.connectionReadyAt = null;
      this.connectionReadyMonotonic = null;
      this.stream = null;
      this.state = "idle";
      this.markConnectingAttemptsCancelled();
      this.dependencies.releaseMicrophone();
    }, this.dependencies.idleTtlMs ?? CLASSIC_REALTIME_IDLE_TTL_MS);
  }

  private connectionReason(): ClassicRealtimeConnectionReason {
    if (this.lastCloseReason === "idle_ttl") return "idle_restart";
    return this.attempts.length === 0 ? "initial_background_warm" : "reconnect";
  }

  private recordDiagnostic(
    generation: number,
    attempt: InternalAttempt,
    event: RealtimeTranscriptionDiagnosticEvent,
  ) {
    if (!this.isCurrentGeneration(generation) || attempt.status !== "connecting") return;
    const at = this.isoNow();
    switch (event.stage) {
      case "session_request_started": attempt.sessionRequestStartedAt = at; break;
      case "session_response":
        attempt.sessionResponseAt = at;
        attempt.sessionRouteMs = diagnosticDuration(event.durationMs);
        break;
      case "peer_connection_created": attempt.peerConnectionCreatedAt = at; break;
      case "offer_created": attempt.offerCreatedAt = at; break;
      case "sdp_request_started": attempt.sdpRequestStartedAt = at; break;
      case "sdp_response":
        attempt.sdpResponseAt = at;
        attempt.sdpHttpStatus = event.httpStatus ?? null;
        attempt.sdpRequestId = event.requestId ?? null;
        attempt.sdpMs = diagnosticDuration(event.durationMs);
        if (event.httpStatus && event.httpStatus >= 200 && event.httpStatus < 300) {
          attempt.errorCode = null;
          attempt.sanitizedErrorMessage = null;
        } else {
          attempt.errorCode = event.errorCode ?? attempt.errorCode;
          attempt.sanitizedErrorMessage =
            event.sanitizedErrorMessage ?? attempt.sanitizedErrorMessage;
        }
        break;
      case "remote_description_set": attempt.remoteDescriptionSetAt = at; break;
      case "data_channel_open": attempt.dataChannelOpenedAt = at; break;
      case "connection_ready": attempt.connectionReadyAt = at; break;
      case "input_track_bound": break;
      case "connection_error":
        attempt.errorStage = event.errorStage ?? "connection_sequence";
        attempt.errorType = event.errorType ?? null;
        attempt.errorCode = event.errorCode ?? null;
        attempt.sanitizedErrorMessage = event.sanitizedErrorMessage ?? null;
        break;
      default: break;
    }
  }

  private markConnectingAttemptsCancelled() {
    for (const attempt of this.attempts) {
      if (attempt.status !== "connecting") continue;
      attempt.status = "cancelled";
      attempt.endedAt = this.isoNow();
      attempt.totalSetupMs = this.elapsedSince(attempt.startedMonotonic);
    }
  }

  private recordFinalizationFailure() {
    this.finalizationFailureCount += 1;
    this.consecutiveFinalizationFailures += 1;
    const threshold = this.dependencies.finalizationFailureThreshold ??
      CLASSIC_REALTIME_FINALIZATION_FAILURE_THRESHOLD;
    if (this.consecutiveFinalizationFailures < threshold) return false;
    this.circuitBreakerTrips += 1;
    this.circuitBreakerTurnsRemaining = this.dependencies.circuitBreakerTurns ??
      CLASSIC_REALTIME_CIRCUIT_BREAKER_TURNS;
    this.consecutiveFinalizationFailures = 0;
    return true;
  }

  private assertActive(handle: ClassicRealtimeTurnHandle) {
    if (this.activeTurn !== handle) throw new Error("classic_realtime_stale_turn");
  }

  private isCurrent(generation: number, transport: RealtimeTransport) {
    return this.isCurrentGeneration(generation) && this.transport === transport;
  }

  private isCurrentGeneration(generation: number) {
    return !this.disposed && generation === this.connectionGeneration;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    const setTimer = this.dependencies.setTimer ?? setTimeout;
    const clearTimer = this.dependencies.clearTimer ?? clearTimeout;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (value: { result: T } | { error: unknown }) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        if ("error" in value) reject(value.error);
        else resolve(value.result);
      };
      const timer = setTimer(
        () => finish({ error: new Error("classic_transcript_timeout") }),
        timeoutMs,
      );
      promise.then(
        (result) => finish({ result }),
        (error) => finish({ error }),
      );
    });
  }

  private cancelIdleTimer() {
    if (!this.idleTimer) return;
    (this.dependencies.clearTimer ?? clearTimeout)(this.idleTimer);
    this.idleTimer = null;
  }

  private cancelReconnectTimer() {
    if (!this.reconnectTimer) return;
    (this.dependencies.clearTimer ?? clearTimeout)(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private now() {
    return (this.dependencies.now ?? (() => performance.now()))();
  }

  private elapsedSince(startedAt: number) {
    const elapsed = this.now() - startedAt;
    return Number.isFinite(elapsed) && elapsed >= 0 ? Math.round(elapsed) : null;
  }

  private isoNow() {
    return new Date((this.dependencies.wallNow ?? Date.now)()).toISOString();
  }

  private id() {
    return this.dependencies.randomId?.() ??
      globalThis.crypto?.randomUUID?.() ??
      `classic-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
