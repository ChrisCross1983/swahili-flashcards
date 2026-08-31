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
    | "connection_error";
  attempt?: number;
  durationMs?: number;
  httpStatus?: number;
  requestId?: string | null;
  errorStage?: string;
  errorType?: string;
  errorCode?: string;
  sanitizedErrorMessage?: string;
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
  private peer: RTCPeerConnection | null = null;
  private events: RTCDataChannel | null = null;
  private abortController: AbortController | null = null;
  private connectionAttemptId: string | null = null;
  private inputTrack: MediaStreamTrack | null = null;
  private sender: RTCRtpSender | null = null;
  private finalWaiter: {
    resolve: (transcript: string) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(private readonly handlers: TranscriptionHandlers) {}

  async connect(stream: MediaStream) {
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

  async setInputEnabled(enabled: boolean) {
    const sender = this.sender;
    if (!sender) throw new Error("transcription_sender_unavailable");
    if (enabled && !this.inputTrack) {
      throw new Error("transcription_track_unavailable");
    }
    await sender.replaceTrack(enabled ? this.inputTrack : null);
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
        this.fail(new Error("data_channel_error"));
      }
    };
    events.onclose = () => {
      if (!this.isCurrent(abortController, connectionAttemptId, peer)) return;
      if (!settled) {
        settled = true;
        rejectReady(new Error("data_channel_closed"));
      } else if (peer.connectionState !== "closed") {
        this.fail(new Error("data_channel_closed"));
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
      if (["failed", "disconnected"].includes(peer.connectionState)) {
        this.fail(new Error("peer_connection_failed"));
      }
    };

    return { peer, events, sender, dataChannelReady, cancelDataChannelWait };
  }

  private cleanupPeerAttempt(resources: PeerAttempt) {
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
    if (event.type === "error") this.fail(new Error("realtime_transcription_error"));
  }

  private fail(error: Error) {
    if (this.finalWaiter) {
      clearTimeout(this.finalWaiter.timeout);
      this.finalWaiter.reject(error);
      this.finalWaiter = null;
    }
    this.handlers.onError();
  }

  private emitDiagnostic(event: RealtimeTranscriptionDiagnosticEvent) {
    this.handlers.onDiagnosticEvent?.(event);
  }
}
