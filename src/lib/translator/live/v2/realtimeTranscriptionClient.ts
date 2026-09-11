import { LIVE_V2_CONFIG } from "./config";
import {
  getOpenAIRequestId,
  liveV2DevelopmentLog,
  retryAfterMs,
  safeOpenAIResponseError,
  sanitizeLiveV2LogText,
} from "./diagnostics";
import type { LiveV2SessionCredential } from "./types";

type ConnectionAttemptDetails = {
  attempt: number;
  httpStatus: number;
  requestId: string | null;
};

type TranscriptionHandlers = {
  onDelta: (delta: string) => void;
  onError: () => void;
  onConnectionAttempt?: (details: ConnectionAttemptDetails) => void;
  onDiagnosticEvent?: (event: RealtimeTranscriptionDiagnosticEvent) => void;
};

export type RealtimeTranscriptionDiagnosticEvent = {
  stage:
    | "connection_sequence_started"
    | "session_request_started"
    | "session_response"
    | "peer_connection_created"
    | "offer_created"
    | "sdp_request_started"
    | "sdp_response"
    | "remote_description_set"
    | "data_channel_open"
    | "connection_ready"
    | "input_track_bound"
    | "connection_state_changed"
    | "temporary_disconnect"
    | "disconnect_recovered"
    | "track_rebind_started"
    | "track_rebind_completed"
    | "input_enabled"
    | "connection_error";
  at?: string;
  attempt?: number;
  durationMs?: number;
  httpStatus?: number;
  requestId?: string | null;
  errorStage?: string;
  errorType?: string;
  errorCode?: string;
  sanitizedErrorMessage?: string;
  captureGeneration?: number;
  connectionState?: RTCPeerConnectionState;
  iceConnectionState?: RTCIceConnectionState;
  signalingState?: RTCSignalingState;
  reasonContext?: string;
  trackRebindOutcome?:
    | "success"
    | "temporary_disconnect_recovered"
    | "connection_failed"
    | "timeout"
    | "sender_unavailable"
    | "stale_generation";
  senderHadTrackBeforeRebind?: boolean;
};

type TranscriptionEvent = {
  type?: unknown;
  delta?: unknown;
  transcript?: unknown;
};

type PeerAttempt = {
  peer: RTCPeerConnection;
  events: RTCDataChannel;
  sender: RTCRtpSender;
  dataChannelReady: Promise<void>;
  cancelDataChannelWait: () => void;
};

class ConnectionCancelled extends Error {
  constructor() {
    super("connection_cancelled");
    this.name = "AbortError";
  }
}

async function requestCredential(
  signal: AbortSignal,
  connectionAttemptId: string,
  emitDiagnostic: (event: RealtimeTranscriptionDiagnosticEvent) => void,
): Promise<LiveV2SessionCredential> {
  const requestStartedAt = performance.now();
  emitDiagnostic({ stage: "session_request_started" });
  let response: Response;
  try {
    response = await fetch("/api/translator/live/v2/session", {
      method: "POST",
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new ConnectionCancelled();
    liveV2DevelopmentLog("request error", {
      request: "client_secret",
      connectionAttemptId,
      name: error instanceof Error ? error.name : "UnknownError",
      message: sanitizeLiveV2LogText(
        error instanceof Error ? error.message : null,
        "Client secret request failed",
      ),
    }, "error");
    throw error;
  }
  emitDiagnostic({
    stage: "session_response",
    httpStatus: response.status,
    durationMs: Math.round(performance.now() - requestStartedAt),
  });
  if (!response.ok) {
    liveV2DevelopmentLog("request error", {
      request: "client_secret",
      connectionAttemptId,
      httpStatus: response.status,
    }, "error");
    throw new Error("client_secret_failed");
  }
  const body = (await response.json()) as Partial<LiveV2SessionCredential>;
  if (
    typeof body.clientSecret !== "string" ||
    typeof body.expiresAt !== "number" ||
    typeof body.transcriptionModel !== "string"
  ) {
    liveV2DevelopmentLog("request error", {
      request: "client_secret",
      connectionAttemptId,
      code: "invalid_client_secret_response",
    }, "error");
    throw new Error("invalid_client_secret_response");
  }
  return body as LiveV2SessionCredential;
}

function retryDelay(response: Response, attempt: number) {
  const fromHeader = retryAfterMs(response.headers.get("Retry-After"));
  if (fromHeader !== null && fromHeader <= LIVE_V2_CONFIG.sdpRetryAfterMaxMs) {
    return fromHeader;
  }
  return LIVE_V2_CONFIG.sdpRetryBackoffMs[attempt - 1] ?? 0;
}

export class RealtimeTranscriptionClientV2 {
  static readonly DISCONNECT_GRACE_PERIOD_MS = 2_000;
  static readonly TRACK_REBIND_TIMEOUT_MS = 1_500;
  private peer: RTCPeerConnection | null = null;
  private events: RTCDataChannel | null = null;
  private abortController: AbortController | null = null;
  private connectionAttemptId: string | null = null;
  private inputTrack: MediaStreamTrack | null = null;
  private inputTrackGeneration: number | null = null;
  private sender: RTCRtpSender | null = null;
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionFailureNotified = false;
  private stateReasonContext = "connection_setup";
  private activeRebind: {
    generation: number;
    disconnected: boolean;
    recovered: boolean;
  } | null = null;
  private rebindOperationGeneration = 0;
  private finalWaiter: {
    resolve: (transcript: string) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(private readonly handlers: TranscriptionHandlers) {}

  async connect(stream: MediaStream, captureGeneration: number | null = null) {
    if (this.abortController || this.peer) {
      throw new Error("transcription_session_already_connected");
    }
    const abortController = new AbortController();
    const connectionAttemptId = crypto.randomUUID();
    this.abortController = abortController;
    this.connectionAttemptId = connectionAttemptId;
    liveV2DevelopmentLog("lifecycle", {
      event: "connection_sequence_started",
      connectionAttemptId,
    });
    this.emitDiagnostic({ stage: "connection_sequence_started" });

    try {
      const credential = await requestCredential(
        abortController.signal,
        connectionAttemptId,
        (event) => this.emitDiagnostic(event),
      );
      this.ensureCurrent(abortController, connectionAttemptId);
      liveV2DevelopmentLog("connection", {
        step: "client_secret_received",
        connectionAttemptId,
        model: credential.transcriptionModel,
      });

      for (let attempt = 1; attempt <= LIVE_V2_CONFIG.sdpMaxAttempts; attempt += 1) {
        this.ensureCurrent(abortController, connectionAttemptId);
        const resources = this.createPeerAttempt(
          stream,
          captureGeneration,
          abortController,
          connectionAttemptId,
          attempt,
        );
        let keepPeer = false;
        let peerCleanedUp = false;

        try {
          const offer = await resources.peer.createOffer();
          this.ensureCurrent(abortController, connectionAttemptId, resources.peer);
          liveV2DevelopmentLog("connection", {
            step: "offer_created",
            connectionAttemptId,
            attempt,
          });
          this.emitDiagnostic({ stage: "offer_created", attempt });
          await resources.peer.setLocalDescription(offer);
          this.ensureCurrent(abortController, connectionAttemptId, resources.peer);
          liveV2DevelopmentLog("connection", {
            step: "local_description_set",
            connectionAttemptId,
            attempt,
          });

          let response: Response;
          const sdpRequestStartedAt = performance.now();
          this.emitDiagnostic({ stage: "sdp_request_started", attempt });
          try {
            response = await fetch(LIVE_V2_CONFIG.realtimeCallsEndpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${credential.clientSecret}`,
                "Content-Type": "application/sdp",
              },
              body: offer.sdp,
              signal: abortController.signal,
            });
          } catch (error) {
            if (abortController.signal.aborted) throw new ConnectionCancelled();
            liveV2DevelopmentLog("request error", {
              request: "realtime_call",
              target: "transcription",
              model: credential.transcriptionModel,
              connectionAttemptId,
              attempt,
              name: error instanceof Error ? error.name : "UnknownError",
              message: sanitizeLiveV2LogText(
                error instanceof Error ? error.message : null,
                "Realtime call request failed",
              ),
            }, "error");
            throw error;
          }
          this.ensureCurrent(abortController, connectionAttemptId, resources.peer);
          const body = await response.text();
          this.ensureCurrent(abortController, connectionAttemptId, resources.peer);
          const requestId = getOpenAIRequestId(response.headers);
          this.handlers.onConnectionAttempt?.({
            attempt,
            httpStatus: response.status,
            requestId,
          });
          const safeError = response.ok
            ? { sanitizedErrorCode: null, sanitizedMessage: null }
            : safeOpenAIResponseError(body);
          this.emitDiagnostic({
            stage: "sdp_response",
            attempt,
            httpStatus: response.status,
            requestId,
            durationMs: Math.round(performance.now() - sdpRequestStartedAt),
            ...(safeError.sanitizedErrorCode
              ? { errorCode: safeError.sanitizedErrorCode }
              : {}),
            ...(safeError.sanitizedMessage
              ? { sanitizedErrorMessage: safeError.sanitizedMessage }
              : {}),
          });
          liveV2DevelopmentLog("connection", {
            step: "sdp_response_received",
            target: "transcription",
            model: credential.transcriptionModel,
            connectionAttemptId,
            attempt,
            httpStatus: response.status,
            requestId,
            responseEmpty: body.length === 0,
            ...safeError,
          });

          if (!response.ok) {
            const retryable = LIVE_V2_CONFIG.sdpRetryStatuses.includes(
              response.status as (typeof LIVE_V2_CONFIG.sdpRetryStatuses)[number],
            );
            if (retryable && attempt < LIVE_V2_CONFIG.sdpMaxAttempts) {
              const delayMs = retryDelay(response, attempt);
              liveV2DevelopmentLog("connection retry", {
                target: "transcription",
                model: credential.transcriptionModel,
                connectionAttemptId,
                attempt,
                nextAttempt: attempt + 1,
                httpStatus: response.status,
                requestId,
                reason: response.status === 429 ? "rate_limit" : "server_error",
                retryDelayMs: delayMs,
                ...safeError,
              });
              this.cleanupPeerAttempt(resources);
              peerCleanedUp = true;
              await this.waitForRetry(
                delayMs,
                abortController,
                connectionAttemptId,
              );
              continue;
            }

            liveV2DevelopmentLog("connection error", {
              step: "sdp_request_failed",
              target: "transcription",
              model: credential.transcriptionModel,
              connectionAttemptId,
              attempt,
              httpStatus: response.status,
              requestId,
              connectionState: resources.peer.connectionState,
              iceConnectionState: resources.peer.iceConnectionState,
              ...safeError,
            }, "error");
            throw new Error("sdp_request_failed");
          }
          if (!body) {
            liveV2DevelopmentLog("connection error", {
              step: "empty_sdp_response",
              target: "transcription",
              model: credential.transcriptionModel,
              connectionAttemptId,
              attempt,
              httpStatus: response.status,
              requestId,
            }, "error");
            throw new Error("empty_sdp_response");
          }

          await resources.peer.setRemoteDescription({ type: "answer", sdp: body });
          this.ensureCurrent(abortController, connectionAttemptId, resources.peer);
          liveV2DevelopmentLog("connection", {
            step: "remote_description_set",
            connectionAttemptId,
            attempt,
            requestId,
          });
          this.emitDiagnostic({
            stage: "remote_description_set",
            attempt,
            requestId,
          });
          if (resources.events.readyState !== "open") {
            await this.waitForDataChannel(
              resources.dataChannelReady,
              abortController.signal,
            );
          }
          this.ensureCurrent(abortController, connectionAttemptId, resources.peer);
          keepPeer = true;
          this.sender = resources.sender;
          liveV2DevelopmentLog("connection", {
            step: "connection_ready",
            target: "transcription",
            model: credential.transcriptionModel,
            connectionAttemptId,
            attempt,
            httpStatus: response.status,
            requestId,
            connectionState: resources.peer.connectionState,
            iceConnectionState: resources.peer.iceConnectionState,
          });
          this.emitDiagnostic({
            stage: "connection_ready",
            attempt,
            httpStatus: response.status,
            requestId,
            at: new Date().toISOString(),
            connectionState: resources.peer.connectionState,
            iceConnectionState: resources.peer.iceConnectionState,
            signalingState: resources.peer.signalingState,
            reasonContext: "connection_ready",
          });
          return;
        } finally {
          if (!keepPeer && !peerCleanedUp) this.cleanupPeerAttempt(resources);
        }
      }
    } catch (error) {
      const cancelled =
        error instanceof ConnectionCancelled ||
        abortController.signal.aborted ||
        this.connectionAttemptId !== connectionAttemptId;
      if (!cancelled) {
        liveV2DevelopmentLog("connection error", {
          step: "connection_sequence_failed",
          connectionAttemptId,
          name: error instanceof Error ? error.name : "UnknownError",
          message: sanitizeLiveV2LogText(
            error instanceof Error ? error.message : null,
            "Realtime connection failed",
          ),
        }, "error");
        this.emitDiagnostic({
          stage: "connection_error",
          errorStage: "connection_sequence",
          errorType: error instanceof Error ? error.name : "UnknownError",
          errorCode: error instanceof Error ? error.message : "connection_failed",
          sanitizedErrorMessage: sanitizeLiveV2LogText(
            error instanceof Error ? error.message : null,
            "Realtime connection failed",
          ),
        });
      }
      this.disconnect(cancelled ? "cancelled" : "failed");
      throw cancelled ? new ConnectionCancelled() : error;
    }
  }

  finalizeTurn() {
    if (!this.events || this.events.readyState !== "open") {
      return Promise.reject(new Error("transcription_channel_unavailable"));
    }
    if (this.finalWaiter) {
      return Promise.reject(new Error("transcription_commit_in_progress"));
    }

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.finalWaiter = null;
        reject(new Error("transcript_final_timeout"));
      }, LIVE_V2_CONFIG.transcriptFinalTimeoutMs);
      this.finalWaiter = { resolve, reject, timeout };
      this.events?.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      liveV2DevelopmentLog("connection", {
        step: "input_audio_buffer_committed",
        connectionAttemptId: this.connectionAttemptId,
      });
    });
  }

  clearTurn() {
    if (!this.events || this.events.readyState !== "open") return;
    this.events.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
    liveV2DevelopmentLog("connection", {
      step: "input_audio_buffer_cleared",
      connectionAttemptId: this.connectionAttemptId,
    });
  }

  async setInputEnabled(enabled: boolean, expectedGeneration?: number) {
    const sender = this.sender;
    if (!sender) throw new Error("transcription_sender_unavailable");
    if (enabled && !this.inputTrack) {
      throw new Error("transcription_track_unavailable");
    }
    if (
      enabled &&
      expectedGeneration !== undefined &&
      this.inputTrackGeneration !== expectedGeneration
    ) {
      throw new Error("transcription_stale_generation");
    }
    if (enabled && sender.track === this.inputTrack) {
      this.emitPeerState("input_enabled", "input_enable");
      return;
    }
    this.stateReasonContext = enabled ? "input_enable" : "input_disable";
    await sender.replaceTrack(enabled ? this.inputTrack : null);
    if (sender !== this.sender || !this.peer) throw new ConnectionCancelled();
    this.emitPeerState("input_enabled", enabled ? "input_enable" : "input_disable");
    this.stateReasonContext = "steady_state";
  }

  async replaceInputStream(stream: MediaStream, captureGeneration: number) {
    const tracks = stream.getAudioTracks();
    if (tracks.length !== 1 || tracks[0].readyState === "ended") {
      throw new Error("single_live_audio_track_required");
    }
    const sender = this.sender;
    if (!sender) {
      this.emitDiagnostic({
        stage: "track_rebind_completed",
        at: new Date().toISOString(),
        captureGeneration,
        trackRebindOutcome: "sender_unavailable",
      });
      throw new Error("transcription_sender_unavailable");
    }
    const nextTrack = tracks[0];
    const peer = this.peer;
    const operationGeneration = ++this.rebindOperationGeneration;
    const senderHadTrackBeforeRebind = Boolean(sender.track);
    this.activeRebind = {
      generation: captureGeneration,
      disconnected: false,
      recovered: false,
    };
    this.stateReasonContext = "track_rebind";
    this.emitPeerState("track_rebind_started", "track_rebind", {
      captureGeneration,
      senderHadTrackBeforeRebind,
    });
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      // Atomic replacement avoids the WebKit-sensitive null -> new-track gap.
      // The previous turn is already gated and its server buffer cleared by
      // the manager before this operation begins.
      await Promise.race([
        sender.replaceTrack(nextTrack),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("transcription_track_rebind_timeout")),
            RealtimeTranscriptionClientV2.TRACK_REBIND_TIMEOUT_MS,
          );
        }),
      ]);
      if (
        sender !== this.sender ||
        peer !== this.peer ||
        !peer ||
        operationGeneration !== this.rebindOperationGeneration
      ) {
        throw new ConnectionCancelled();
      }
      this.inputTrack = nextTrack;
      this.inputTrackGeneration = captureGeneration;
      this.emitDiagnostic({
        stage: "input_track_bound",
        at: new Date().toISOString(),
        captureGeneration,
      });
      const outcome = this.activeRebind?.recovered
        ? "temporary_disconnect_recovered" as const
        : "success" as const;
      this.emitPeerState("track_rebind_completed", "track_rebind", {
        captureGeneration,
        trackRebindOutcome: outcome,
        senderHadTrackBeforeRebind,
      });
    } catch (error) {
      const outcome = error instanceof Error &&
        error.message === "transcription_track_rebind_timeout"
        ? "timeout" as const
        : this.peer?.connectionState === "failed"
          ? "connection_failed" as const
          : "stale_generation" as const;
      this.emitPeerState("track_rebind_completed", "track_rebind", {
        captureGeneration,
        trackRebindOutcome: outcome,
        senderHadTrackBeforeRebind,
      });
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      this.activeRebind = null;
      this.stateReasonContext = "steady_state";
    }
  }

  getInputTrackGeneration() {
    return this.inputTrackGeneration;
  }

  disconnect(reason = "client_disconnect") {
    const connectionAttemptId = this.connectionAttemptId;
    this.connectionAttemptId = null;
    this.abortController?.abort();
    this.abortController = null;
    if (this.finalWaiter) {
      clearTimeout(this.finalWaiter.timeout);
      this.finalWaiter.reject(new DOMException("Session stopped", "AbortError"));
      this.finalWaiter = null;
    }
    const peer = this.peer;
    const events = this.events;
    this.peer = null;
    this.events = null;
    this.sender = null;
    this.inputTrack = null;
    this.inputTrackGeneration = null;
    this.rebindOperationGeneration += 1;
    this.activeRebind = null;
    this.connectionFailureNotified = false;
    this.cancelDisconnectGracePeriod();
    if (events) {
      events.onopen = null;
      events.onmessage = null;
      events.onerror = null;
      events.onclose = null;
      events.close();
    }
    if (peer) {
      peer.onconnectionstatechange = null;
      peer.close();
    }
    liveV2DevelopmentLog("lifecycle", {
      event: "connection_sequence_stopped",
      reason,
      connectionAttemptId,
    });
  }

  private createPeerAttempt(
    stream: MediaStream,
    captureGeneration: number | null,
    abortController: AbortController,
    connectionAttemptId: string,
    attempt: number,
  ): PeerAttempt {
    const peer = new RTCPeerConnection();
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length !== 1) {
      peer.close();
      throw new Error("single_audio_track_required");
    }
    this.inputTrack = audioTracks[0];
    this.inputTrackGeneration = captureGeneration;
    const sender = peer.addTrack(audioTracks[0], stream);
    const events = peer.createDataChannel("oai-events");
    this.peer = peer;
    this.events = events;
    liveV2DevelopmentLog("connection", {
      step: "peer_connection_created",
      connectionAttemptId,
      attempt,
      trackCount: 1,
    });
    this.emitDiagnostic({ stage: "peer_connection_created", attempt });

    let settled = false;
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const dataChannelReady = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    void dataChannelReady.catch(() => undefined);
    const cancelDataChannelWait = () => {
      if (settled) return;
      settled = true;
      rejectReady(new ConnectionCancelled());
    };

    events.onmessage = (message) => {
      if (this.isCurrent(abortController, connectionAttemptId, peer)) {
        this.handleEvent(message.data);
      }
    };
    events.onopen = () => {
      if (!this.isCurrent(abortController, connectionAttemptId, peer) || settled) return;
      settled = true;
      liveV2DevelopmentLog("connection", {
        step: "data_channel_open",
        connectionAttemptId,
        attempt,
      });
      this.emitDiagnostic({ stage: "data_channel_open", attempt });
      resolveReady();
    };
    events.onerror = () => {
      if (!this.isCurrent(abortController, connectionAttemptId, peer)) return;
      if (!settled) {
        settled = true;
        rejectReady(new Error("data_channel_error"));
      } else {
        this.notifyConnectionFailure(new Error("data_channel_error"));
      }
    };
    events.onclose = () => {
      if (!this.isCurrent(abortController, connectionAttemptId, peer)) return;
      if (!settled) {
        settled = true;
        rejectReady(new Error("data_channel_closed"));
      } else if (peer.connectionState !== "closed") {
        this.notifyConnectionFailure(new Error("data_channel_closed"));
      }
    };
    peer.onconnectionstatechange = () => {
      if (!this.isCurrent(abortController, connectionAttemptId, peer)) return;
      liveV2DevelopmentLog("connection", {
        step: "webrtc_state",
        connectionAttemptId,
        attempt,
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
      });
      this.emitPeerState("connection_state_changed", this.stateReasonContext);
      if (peer.connectionState === "connected") {
        if (this.disconnectGraceTimer) {
          this.cancelDisconnectGracePeriod();
          if (this.activeRebind) this.activeRebind.recovered = true;
          this.emitPeerState("disconnect_recovered", this.stateReasonContext);
        }
        return;
      }
      if (peer.connectionState === "failed") {
        this.cancelDisconnectGracePeriod();
        this.notifyConnectionFailure(new Error("peer_connection_failed"));
        return;
      }
      if (peer.connectionState === "disconnected") {
        if (this.activeRebind) this.activeRebind.disconnected = true;
        this.emitPeerState("temporary_disconnect", this.stateReasonContext);
        this.startDisconnectGracePeriod(peer, abortController, connectionAttemptId);
      }
    };

    return { peer, events, sender, dataChannelReady, cancelDataChannelWait };
  }

  private cleanupPeerAttempt(resources: PeerAttempt) {
    this.cancelDisconnectGracePeriod();
    resources.cancelDataChannelWait();
    resources.events.onopen = null;
    resources.events.onmessage = null;
    resources.events.onerror = null;
    resources.events.onclose = null;
    resources.events.close();
    resources.peer.onconnectionstatechange = null;
    resources.peer.close();
    if (this.events === resources.events) this.events = null;
    if (this.peer === resources.peer) this.peer = null;
    if (this.sender === resources.sender) this.sender = null;
  }

  private waitForRetry(
    delayMs: number,
    abortController: AbortController,
    connectionAttemptId: string,
  ) {
    return new Promise<void>((resolve, reject) => {
      if (!this.isCurrent(abortController, connectionAttemptId)) {
        reject(new ConnectionCancelled());
        return;
      }
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        abortController.signal.removeEventListener("abort", cancel);
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => finish(new ConnectionCancelled());
      const timer = setTimeout(() => {
        if (!this.isCurrent(abortController, connectionAttemptId)) {
          finish(new ConnectionCancelled());
          return;
        }
        finish();
      }, delayMs);
      abortController.signal.addEventListener("abort", cancel, { once: true });
    });
  }

  private waitForDataChannel(ready: Promise<void>, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => finish(new ConnectionCancelled());
      const timeout = setTimeout(
        () => finish(new Error("data_channel_open_timeout")),
        LIVE_V2_CONFIG.dataChannelOpenTimeoutMs,
      );
      signal.addEventListener("abort", cancel, { once: true });
      ready.then(() => finish(), (error) => finish(error));
    });
  }

  private isCurrent(
    abortController: AbortController,
    connectionAttemptId: string,
    peer?: RTCPeerConnection,
  ) {
    return (
      !abortController.signal.aborted &&
      this.abortController === abortController &&
      this.connectionAttemptId === connectionAttemptId &&
      (!peer || this.peer === peer)
    );
  }

  private ensureCurrent(
    abortController: AbortController,
    connectionAttemptId: string,
    peer?: RTCPeerConnection,
  ) {
    if (!this.isCurrent(abortController, connectionAttemptId, peer)) {
      throw new ConnectionCancelled();
    }
  }

  private handleEvent(raw: unknown) {
    if (typeof raw !== "string") return;
    let event: TranscriptionEvent;
    try {
      event = JSON.parse(raw) as TranscriptionEvent;
    } catch {
      return;
    }
    if (
      event.type === "conversation.item.input_audio_transcription.delta" &&
      typeof event.delta === "string"
    ) {
      this.handlers.onDelta(event.delta);
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = typeof event.transcript === "string" ? event.transcript.trim() : "";
      const waiter = this.finalWaiter;
      if (!waiter) return;
      this.finalWaiter = null;
      clearTimeout(waiter.timeout);
      waiter.resolve(transcript);
      return;
    }
    if (event.type === "error") {
      this.notifyConnectionFailure(new Error("realtime_transcription_error"));
    }
  }

  private fail(error: Error) {
    if (this.finalWaiter) {
      clearTimeout(this.finalWaiter.timeout);
      this.finalWaiter.reject(error);
      this.finalWaiter = null;
    }
    this.handlers.onError();
  }

  private notifyConnectionFailure(error: Error) {
    if (this.connectionFailureNotified) return;
    this.connectionFailureNotified = true;
    const peer = this.peer;
    this.emitDiagnostic({
      stage: "connection_error",
      at: new Date().toISOString(),
      ...(peer ? {
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        signalingState: peer.signalingState,
      } : {}),
      reasonContext: this.stateReasonContext,
      errorStage: "webrtc_connection_state",
      errorCode: error.message,
    });
    this.fail(error);
  }

  private startDisconnectGracePeriod(
    peer: RTCPeerConnection,
    abortController: AbortController,
    connectionAttemptId: string,
  ) {
    if (this.disconnectGraceTimer) return;
    this.disconnectGraceTimer = setTimeout(() => {
      this.disconnectGraceTimer = null;
      if (!this.isCurrent(abortController, connectionAttemptId, peer)) return;
      if (peer.connectionState === "disconnected") {
        this.notifyConnectionFailure(new Error("peer_connection_disconnected"));
      }
    }, RealtimeTranscriptionClientV2.DISCONNECT_GRACE_PERIOD_MS);
  }

  private cancelDisconnectGracePeriod() {
    if (!this.disconnectGraceTimer) return;
    clearTimeout(this.disconnectGraceTimer);
    this.disconnectGraceTimer = null;
  }

  private emitPeerState(
    stage: Extract<RealtimeTranscriptionDiagnosticEvent["stage"],
      | "connection_state_changed"
      | "temporary_disconnect"
      | "disconnect_recovered"
      | "track_rebind_started"
      | "track_rebind_completed"
      | "input_enabled">,
    reasonContext: string,
    details: Partial<RealtimeTranscriptionDiagnosticEvent> = {},
  ) {
    const peer = this.peer;
    this.emitDiagnostic({
      stage,
      at: new Date().toISOString(),
      ...(peer ? {
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        signalingState: peer.signalingState,
      } : {}),
      reasonContext,
      ...details,
    });
  }

  private emitDiagnostic(event: RealtimeTranscriptionDiagnosticEvent) {
    this.handlers.onDiagnosticEvent?.(event);
  }
}
