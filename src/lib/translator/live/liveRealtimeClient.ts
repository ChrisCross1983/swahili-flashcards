import {
  LIVE_AUDIO_CONSTRAINTS,
  LIVE_TRANSLATOR_BETA,
  LIVE_TURN_DETECTION,
  LIVE_TURN_SILENCE_MS,
} from "./config";
import { detectLiveLanguage, targetForSource } from "./languageDetection";
import { parseTranslationServerEvent } from "./realtimeEvents";
import { buildLiveSessionReport, liveReportFilename } from "./sessionReport";
import { shouldDiscardNoiseTurn, shouldFinishLiveTurn } from "./turnDetection";
import {
  LiveTurnPerformanceTracker,
  logLiveTurnPerformance,
} from "./turnPerformance";
import type {
  LiveClientSnapshot,
  LiveDetectedLanguage,
  LiveDetectionStatus,
  LiveLanguage,
  LiveSessionCredential,
  LiveSessionReport,
  LiveSessionResponse,
  LiveTranscriptTurn,
} from "./types";

type Listener = (snapshot: LiveClientSnapshot) => void;

type ConnectionStep =
  | "client_secret_received"
  | "peer_connection_created"
  | "microphone_track_added"
  | "data_channel_created"
  | "offer_created"
  | "local_description_set"
  | "sdp_request_started"
  | "sdp_response_received"
  | "remote_description_setting"
  | "remote_description_set"
  | "data_channel_open"
  | "remote_audio_track_received"
  | "connection_ready";

type SafeConnectionDetails = {
  endpoint?: string;
  attempt?: number;
  httpStatus?: number;
  responseContentType?: string | null;
  responseEmpty?: boolean;
  upstreamErrorType?: string;
  upstreamErrorCode?: string;
  upstreamErrorMessage?: string;
};

type DirectionSession = {
  targetLanguage: LiveLanguage;
  peer: RTCPeerConnection;
  events: RTCDataChannel;
  remoteStream: MediaStream | null;
  remoteTrack: MediaStreamTrack | null;
  analyser: AnalyserNode | null;
  audioSink: HTMLAudioElement | null;
};

type TurnCapture = {
  id: string;
  startedAt: number;
  startedAtEpochMs: number;
  endedAt: number | null;
  endedAtEpochMs: number | null;
  silenceDurationMs: number | null;
  activeSpeechMs: number;
  sourceTranscripts: Record<LiveLanguage, string>;
  outputTranscripts: Record<LiveLanguage, string>;
  outputTranscriptStartedAt: Partial<Record<LiveLanguage, number>>;
  outputTranscriptCompletedAt: Partial<Record<LiveLanguage, number>>;
  firstTranslationAt: Partial<Record<LiveLanguage, number>>;
  firstAudioAt: Partial<Record<LiveLanguage, number>>;
  lastRemoteSoundAt: Partial<Record<LiveLanguage, number>>;
  recorders: Map<LiveLanguage, MediaRecorder>;
  chunks: Map<LiveLanguage, Blob[]>;
  audioCaptureErrors: Partial<Record<LiveLanguage, string>>;
  audioBlobSizes: Partial<Record<LiveLanguage, number>>;
  performance: LiveTurnPerformanceTracker;
};

type DetectionResult = {
  language: LiveDetectedLanguage;
  status: LiveDetectionStatus;
  httpStatus: number | null;
  errorCode: string | null;
  transcript: string;
  candidateCount: number;
};

const initialSnapshot: LiveClientSnapshot = {
  phase: "idle",
  connectionStatus: "idle",
  detectedLanguage: "unknown",
  targetLanguage: null,
  transcript: [],
  error: null,
  audioPlaying: false,
  sessionId: null,
};

let activeClient: LiveRealtimeClient | null = null;

class ConnectionAttemptCancelled extends Error {
  constructor() {
    super("connection_attempt_cancelled");
    this.name = "ConnectionAttemptCancelled";
  }
}

class LiveConnectionError extends Error {
  constructor(
    readonly targetLanguage: LiveLanguage,
    readonly step: ConnectionStep,
    message: string,
    readonly details: SafeConnectionDetails = {},
  ) {
    super(message);
    this.name = "LiveConnectionError";
  }
}

function developmentOnly() {
  return process.env.NODE_ENV === "development";
}

function safeLogText(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\bek_[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .slice(0, 500);
}

function logConnection(
  targetLanguage: LiveLanguage,
  step: ConnectionStep,
  details: SafeConnectionDetails = {},
) {
  if (!developmentOnly()) return;
  console.info("[translator-live][connection]", {
    targetLanguage,
    step,
    ...details,
  });
}

function webRtcState(peer: RTCPeerConnection) {
  return {
    connectionState: peer.connectionState,
    iceConnectionState: peer.iceConnectionState,
    signalingState: peer.signalingState,
    iceGatheringState: peer.iceGatheringState,
  };
}

function logWebRtcState(
  targetLanguage: LiveLanguage,
  peer: RTCPeerConnection,
  dataChannelState?: RTCDataChannelState,
) {
  if (!developmentOnly()) return;
  console.info("[translator-live][webrtc state]", {
    targetLanguage,
    ...webRtcState(peer),
    ...(dataChannelState ? { dataChannelState } : {}),
  });
}

function logConnectionError(
  targetLanguage: LiveLanguage,
  step: ConnectionStep,
  error: unknown,
  peer: RTCPeerConnection | null,
  details: SafeConnectionDetails = {},
) {
  if (!developmentOnly()) return;
  const name = error instanceof Error ? error.name : "Error";
  const message = safeLogText(error instanceof Error ? error.message : error);
  console.error("[translator-live][connection error]", {
    targetLanguage,
    step,
    name,
    message,
    ...details,
    ...(peer ? webRtcState(peer) : {}),
  });
}

function logConnectionRetry(
  targetLanguage: LiveLanguage,
  attempt: number,
  delayMs: number,
) {
  if (!developmentOnly()) return;
  console.info("[translator-live][connection retry]", {
    targetLanguage,
    attempt,
    reason: "rate_limit",
    delayMs,
  });
}

function parseSafeUpstreamError(text: string): SafeConnectionDetails {
  try {
    const body = JSON.parse(text) as {
      error?: { type?: unknown; code?: unknown; message?: unknown };
    };
    return {
      upstreamErrorType: safeLogText(body.error?.type),
      upstreamErrorCode: safeLogText(body.error?.code),
      upstreamErrorMessage: safeLogText(body.error?.message),
    };
  } catch {
    return {};
  }
}

function claimLiveClient(client: LiveRealtimeClient) {
  if (activeClient && activeClient !== client) return false;
  activeClient = client;
  return true;
}

function retryAfterDelayMs(value: string | null, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  const parsed = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(value) - now;
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > LIVE_TRANSLATOR_BETA.sdpRetryAfterMaxMs
  ) {
    return null;
  }
  return Math.max(250, Math.round(parsed));
}

function rms(analyser: AnalyserNode) {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (const value of data) {
    const normalized = (value - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / data.length);
}

function friendlyStartError(error: unknown) {
  if (
    error instanceof DOMException &&
    ["NotAllowedError", "NotFoundError", "NotReadableError", "SecurityError"].includes(
      error.name,
    )
  ) {
    return "Mikrofon konnte nicht geöffnet werden.";
  }
  return "Live-Übersetzung ist gerade nicht verfügbar.";
}

async function getCredentials(): Promise<LiveSessionCredential[]> {
  const response = await fetch("/api/translator/live/session", {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("session_unavailable");
  const body = (await response.json()) as Partial<LiveSessionResponse>;
  if (
    !Array.isArray(body.sessions) ||
    body.sessions.length !== 2 ||
    body.sessions.some(
      (item) =>
        !item ||
        (item.targetLanguage !== "de" && item.targetLanguage !== "sw") ||
        typeof item.clientSecret !== "string",
    )
  ) {
    throw new Error("invalid_session_response");
  }
  for (const session of body.sessions) {
    logConnection(session.targetLanguage, "client_secret_received");
  }
  return body.sessions;
}

function transcriptCandidates(turn: TurnCapture) {
  return [...new Set(
    Object.values(turn.sourceTranscripts)
      .map((text) => text.trim())
      .filter(Boolean),
  )].sort((a, b) => b.length - a.length);
}

function safeDetectCode(value: unknown) {
  return typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value)
    ? value
    : "detect_failed";
}

function logDetectRequest(turnId: string, transcript: string, candidateCount: number) {
  if (!developmentOnly()) return;
  console.info("[translator-live][detect request]", {
    turnId,
    transcriptLength: transcript.length,
    hasTranscript: transcript.length > 0,
    candidateCount,
  });
}

function logDetectError(
  turnId: string,
  httpStatus: number | null,
  safeCode: string,
  reason: string,
) {
  if (!developmentOnly()) return;
  console.error("[translator-live][detect error]", {
    turnId,
    httpStatus,
    safeCode,
    reason,
  });
}

function logRemoteAudio(
  targetLanguage: LiveLanguage,
  event: "track_received" | "unmuted" | "muted" | "playing" | "paused" | "ended",
) {
  if (!developmentOnly()) return;
  console.info("[translator-live][remote audio]", { targetLanguage, event });
}

async function detectLanguageReliably(
  turnId: string,
  candidates: string[],
): Promise<DetectionResult> {
  const text = candidates[0] ?? "";
  logDetectRequest(turnId, text, candidates.length);
  if (!text) {
    return {
      language: "unknown",
      status: "skipped",
      httpStatus: null,
      errorCode: "empty_transcript",
      transcript: "",
      candidateCount: 0,
    };
  }

  try {
    const response = await fetch("/api/translator/live/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnId, text }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as {
      language?: unknown;
      code?: unknown;
      reason?: unknown;
    };
    if (!response.ok) {
      const errorCode = safeDetectCode(body.code);
      const reason = safeDetectCode(body.reason);
      logDetectError(turnId, response.status, errorCode, reason);
      return {
        language: detectLiveLanguage(text),
        status: "error",
        httpStatus: response.status,
        errorCode,
        transcript: text,
        candidateCount: candidates.length,
      };
    }
    const language = body.language === "de" || body.language === "sw"
      ? body.language
      : ("unknown" as const);
    return {
      language,
      status: language === "unknown" ? "unknown" : "success",
      httpStatus: response.status,
      errorCode: null,
      transcript: text,
      candidateCount: candidates.length,
    };
  } catch {
    logDetectError(turnId, null, "network_error", "request_failed");
    return {
      language: detectLiveLanguage(text),
      status: "error",
      httpStatus: null,
      errorCode: "network_error",
      transcript: text,
      candidateCount: candidates.length,
    };
  }
}

export class LiveRealtimeClient {
  private snapshot: LiveClientSnapshot = { ...initialSnapshot };
  private listeners = new Set<Listener>();
  private sourceStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceAnalyser: AnalyserNode | null = null;
  private sessions = new Map<LiveLanguage, DirectionSession>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentTurn: TurnCapture | null = null;
  private aboveThresholdFrames = 0;
  private lastSpeechAt = 0;
  private playbackAudio: HTMLAudioElement | null = null;
  private preparedPlaybackAudio: HTMLAudioElement | null = null;
  private playbackObjectUrl: string | null = null;
  private stopped = false;
  private finalizing = false;
  private connectionAttempt = 0;
  private connectionAbortController: AbortController | null = null;
  private sessionId: string | null = null;
  private sessionStartedAt: string | null = null;
  private sessionEndedAt: string | null = null;
  private playbackTurnId: string | null = null;
  private gatedSpeechFrames = 0;
  private gatedTurnLogged = false;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this.snapshot;
  }

  getTestReport(): LiveSessionReport | null {
    if (!this.sessionId || !this.sessionStartedAt) return null;
    return buildLiveSessionReport({
      sessionId: this.sessionId,
      startedAt: this.sessionStartedAt,
      endedAt: this.sessionEndedAt,
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent ?? "",
      platform: typeof navigator === "undefined" ? "" : navigator.platform ?? "",
      turnSilenceMs: LIVE_TURN_SILENCE_MS,
      turns: this.snapshot.transcript,
    });
  }

  exportTestReport() {
    const report = this.getTestReport();
    if (!report || typeof document === "undefined") return false;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = liveReportFilename();
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }

  async start() {
    if (!claimLiveClient(this)) {
      this.update({
        phase: "error",
        connectionStatus: "disconnected",
        error: "Es läuft bereits ein Live-Gespräch.",
      });
      return;
    }
    if (this.snapshot.connectionStatus === "connecting" || this.snapshot.connectionStatus === "connected") {
      return;
    }

    if (!this.sessionId || this.sessionEndedAt) {
      this.sessionId = crypto.randomUUID();
      this.sessionStartedAt = new Date().toISOString();
      this.sessionEndedAt = null;
      this.update({ transcript: [], sessionId: this.sessionId });
    }

    this.stopped = false;
    const attempt = ++this.connectionAttempt;
    const connectionAbortController = new AbortController();
    this.connectionAbortController = connectionAbortController;
    this.update({
      phase: "connecting",
      connectionStatus: "connecting",
      error: null,
      detectedLanguage: "unknown",
      targetLanguage: null,
    });

    try {
      // Create the reusable playback element synchronously in the start-button
      // gesture. This gives Mobile Safari the same prepared-element path used by
      // the stable translator, while the actual source remains selected per turn.
      if (!this.preparedPlaybackAudio) {
        this.preparedPlaybackAudio = new Audio();
        this.preparedPlaybackAudio.preload = "auto";
        this.preparedPlaybackAudio.setAttribute("playsinline", "");
      }
      const AudioContextClass = window.AudioContext;
      this.audioContext = new AudioContextClass();
      await this.audioContext.resume();

      const credentialsPromise = getCredentials();
      const streamPromise = navigator.mediaDevices.getUserMedia({
        audio: LIVE_AUDIO_CONSTRAINTS,
      });
      const [credentials, stream] = await Promise.all([credentialsPromise, streamPromise]);
      if (!this.isCurrentAttempt(attempt)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.sourceStream = stream;
      const sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.sourceAnalyser = this.audioContext.createAnalyser();
      this.sourceAnalyser.fftSize = 1024;
      sourceNode.connect(this.sourceAnalyser);

      for (const targetLanguage of ["sw", "de"] as const) {
        const credential = credentials.find(
          (item) => item.targetLanguage === targetLanguage,
        );
        if (!credential) throw new Error("missing_sidecar_credential");
        await this.connect(
          credential,
          attempt,
          connectionAbortController.signal,
        );
      }
      if (!this.isCurrentAttempt(attempt)) return;
      if (developmentOnly()) {
        console.info("[translator-live][turn detection]", {
          turnPauseMs: LIVE_TURN_SILENCE_MS,
          label: `Turn pause: ${LIVE_TURN_SILENCE_MS} ms`,
        });
      }
      this.update({ phase: "listening", connectionStatus: "connected", error: null });
      this.timer = setInterval(() => this.sampleAudio(), LIVE_TURN_DETECTION.sampleIntervalMs);
    } catch (error) {
      if (error instanceof ConnectionAttemptCancelled || !this.isCurrentAttempt(attempt)) {
        return;
      }
      const message = friendlyStartError(error);
      this.teardown(false);
      this.update({ phase: "error", connectionStatus: "disconnected", error: message });
    }
  }

  async reconnect() {
    this.teardown(false);
    this.update({ phase: "connecting", connectionStatus: "reconnecting", error: null });
    await this.start();
  }

  stopAudio() {
    if (!this.playbackAudio) return;
    this.playbackAudio.onended = null;
    this.playbackAudio.onerror = null;
    this.playbackAudio.pause();
    this.playbackAudio.onplaying = null;
    this.playbackAudio.onpause = null;
    this.playbackAudio.removeAttribute("src");
    this.playbackAudio.load();
    if (!this.stopped) this.preparedPlaybackAudio = this.playbackAudio;
    this.playbackAudio = null;
    if (this.playbackObjectUrl) URL.revokeObjectURL(this.playbackObjectUrl);
    this.playbackObjectUrl = null;
    if (this.playbackTurnId) {
      this.updateTurn(this.playbackTurnId, {
        playbackStopped: true,
        errorCode: "playback_stopped_by_user",
      });
      this.playbackTurnId = null;
    }
    this.resumeListening();
  }

  stop() {
    this.recordInterruptedTurn("session_ended");
    if (!this.sessionEndedAt && this.sessionStartedAt) {
      this.sessionEndedAt = new Date().toISOString();
    }
    this.teardown(true);
    this.update({
      ...initialSnapshot,
      transcript: this.snapshot.transcript,
      sessionId: this.sessionId,
    });
  }

  private async connect(
    credential: LiveSessionCredential,
    attempt: number,
    signal: AbortSignal,
  ) {
    const { targetLanguage } = credential;
    let step: ConnectionStep = "client_secret_received";
    let peer: RTCPeerConnection | null = null;
    let session: DirectionSession | null = null;

    try {
      this.ensureCurrentAttempt(attempt);
      if (!this.sourceStream || !this.audioContext) throw new Error("missing_media");

      peer = new RTCPeerConnection();
      step = "peer_connection_created";
      logConnection(targetLanguage, step);

      for (const track of this.sourceStream.getAudioTracks()) {
        peer.addTrack(track, this.sourceStream);
      }
      step = "microphone_track_added";
      logConnection(targetLanguage, step);

      const events = peer.createDataChannel("oai-events");
      step = "data_channel_created";
      logConnection(targetLanguage, step);
      session = {
        targetLanguage,
        peer,
        events,
        remoteStream: null,
        remoteTrack: null,
        analyser: null,
        audioSink: null,
      };
      this.sessions.set(targetLanguage, session);

      let resolveDataChannel!: () => void;
      let rejectDataChannel!: (error: Error) => void;
      const dataChannelReady = new Promise<void>((resolve, reject) => {
        resolveDataChannel = resolve;
        rejectDataChannel = reject;
      });
      let dataChannelOpenLogged = false;
      // Attach a handler immediately so an early WebRTC error cannot become an
      // unhandled rejection before setRemoteDescription has completed.
      void dataChannelReady.catch(() => undefined);

      peer.ontrack = ({ streams, track }) => {
        logConnection(targetLanguage, "remote_audio_track_received");
        logRemoteAudio(targetLanguage, "track_received");
        const remoteStream = streams[0] ?? new MediaStream([track]);
        if (!session) return;
        session.remoteStream = remoteStream;
        session.remoteTrack = track;
        track.onunmute = () => logRemoteAudio(targetLanguage, "unmuted");
        track.onmute = () => logRemoteAudio(targetLanguage, "muted");
        track.onended = () => logRemoteAudio(targetLanguage, "ended");
        if (track.muted) logRemoteAudio(targetLanguage, "muted");

        const audioSink = new Audio();
        audioSink.autoplay = true;
        audioSink.muted = true;
        audioSink.setAttribute("playsinline", "");
        audioSink.srcObject = remoteStream;
        audioSink.onplaying = () => logRemoteAudio(targetLanguage, "playing");
        audioSink.onpause = () => logRemoteAudio(targetLanguage, "paused");
        audioSink.onended = () => logRemoteAudio(targetLanguage, "ended");
        session.audioSink = audioSink;
        void audioSink.play().catch(() => undefined);

        if (!this.audioContext) return;
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 1024;
        this.audioContext.createMediaStreamSource(remoteStream).connect(analyser);
        session.analyser = analyser;
        if (this.currentTurn && !this.finalizing) {
          this.startTurnRecorder(this.currentTurn, session);
        }
      };
      events.onmessage = ({ data }) => this.handleServerEvent(targetLanguage, data);
      events.onopen = () => {
        logWebRtcState(targetLanguage, peer!, events.readyState);
        logConnection(targetLanguage, "data_channel_open");
        dataChannelOpenLogged = true;
        resolveDataChannel();
      };
      events.onclose = () => {
        logWebRtcState(targetLanguage, peer!, events.readyState);
        rejectDataChannel(new Error("data_channel_closed_before_open"));
      };
      events.onerror = () => {
        logWebRtcState(targetLanguage, peer!, events.readyState);
        rejectDataChannel(new Error("data_channel_error"));
      };

      const handlePeerStateChange = () => logWebRtcState(targetLanguage, peer!);
      peer.oniceconnectionstatechange = handlePeerStateChange;
      peer.onsignalingstatechange = handlePeerStateChange;
      peer.onicegatheringstatechange = handlePeerStateChange;
      peer.onconnectionstatechange = () => {
        handlePeerStateChange();
        if (
          !this.stopped &&
          ["failed", "disconnected", "closed"].includes(peer!.connectionState)
        ) {
          this.failConnection();
        }
      };

      const offer = await peer.createOffer();
      this.ensureCurrentAttempt(attempt);
      step = "offer_created";
      logConnection(targetLanguage, step);

      await peer.setLocalDescription(offer);
      this.ensureCurrentAttempt(attempt);
      step = "local_description_set";
      logConnection(targetLanguage, step);

      let answerSdp = "";
      let sdpAttempt = 0;
      let responseDetails: SafeConnectionDetails = {
        endpoint: LIVE_TRANSLATOR_BETA.endpoint,
      };
      while (sdpAttempt < LIVE_TRANSLATOR_BETA.sdpMaxAttempts) {
        sdpAttempt += 1;
        this.ensureCurrentAttempt(attempt);
        step = "sdp_request_started";
        logConnection(targetLanguage, step, {
          endpoint: LIVE_TRANSLATOR_BETA.endpoint,
          attempt: sdpAttempt,
        });
        const answer = await fetch(LIVE_TRANSLATOR_BETA.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credential.clientSecret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
          signal,
        });
        this.ensureCurrentAttempt(attempt);
        answerSdp = await answer.text();
        responseDetails = {
          endpoint: LIVE_TRANSLATOR_BETA.endpoint,
          attempt: sdpAttempt,
          httpStatus: answer.status,
          responseContentType: answer.headers.get("Content-Type"),
          responseEmpty: answerSdp.length === 0,
        };
        step = "sdp_response_received";
        logConnection(targetLanguage, step, responseDetails);
        if (answer.ok) break;

        const details = { ...responseDetails, ...parseSafeUpstreamError(answerSdp) };
        if (
          answer.status !== 429 ||
          sdpAttempt >= LIVE_TRANSLATOR_BETA.sdpMaxAttempts
        ) {
          throw new LiveConnectionError(
            targetLanguage,
            step,
            "sdp_request_failed",
            details,
          );
        }

        const delayMs = retryAfterDelayMs(answer.headers.get("Retry-After")) ??
          LIVE_TRANSLATOR_BETA.sdpRetryBackoffMs[sdpAttempt - 1];
        logConnectionRetry(targetLanguage, sdpAttempt + 1, delayMs);
        await this.waitForConnectionRetry(delayMs, attempt, signal);
      }
      if (responseDetails.responseEmpty) {
        throw new LiveConnectionError(
          targetLanguage,
          step,
          "empty_sdp_response",
          responseDetails,
        );
      }

      step = "remote_description_setting";
      await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
      this.ensureCurrentAttempt(attempt);
      step = "remote_description_set";
      logConnection(targetLanguage, step);

      if (events.readyState !== "open") {
        await this.waitForDataChannel(dataChannelReady);
      } else if (!dataChannelOpenLogged) {
        logConnection(targetLanguage, "data_channel_open");
      }
      this.ensureCurrentAttempt(attempt);
      step = "connection_ready";
      logConnection(targetLanguage, step, { attempt: sdpAttempt });
    } catch (error) {
      const cancelled = error instanceof ConnectionAttemptCancelled ||
        signal.aborted ||
        !this.isCurrentAttempt(attempt);
      if (!cancelled) {
        const connectionError = error instanceof LiveConnectionError ? error : null;
        logConnectionError(
          targetLanguage,
          connectionError?.step ?? step,
          error,
          peer,
          connectionError?.details,
        );
      }
      if (session && this.sessions.get(targetLanguage) === session) {
        this.sessions.delete(targetLanguage);
      }
      if (session) this.cleanupDirectionAudio(session);
      if (peer) {
        peer.onconnectionstatechange = null;
        peer.oniceconnectionstatechange = null;
        peer.onsignalingstatechange = null;
        peer.onicegatheringstatechange = null;
        peer.close();
      }
      throw cancelled ? new ConnectionAttemptCancelled() : error;
    }
  }

  private waitForConnectionRetry(
    delayMs: number,
    attempt: number,
    signal: AbortSignal,
  ) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted || !this.isCurrentAttempt(attempt)) {
        reject(new ConnectionAttemptCancelled());
        return;
      }
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => finish(new ConnectionAttemptCancelled());
      const timer = setTimeout(() => {
        if (!this.isCurrentAttempt(attempt)) {
          finish(new ConnectionAttemptCancelled());
          return;
        }
        finish();
      }, delayMs);
      signal.addEventListener("abort", cancel, { once: true });
    });
  }

  private waitForDataChannel(dataChannelReady: Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("data_channel_open_timeout")),
        LIVE_TRANSLATOR_BETA.dataChannelOpenTimeoutMs,
      );
      dataChannelReady.then(
        () => {
          clearTimeout(timeout);
          resolve();
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }

  private cleanupDirectionAudio(session: DirectionSession) {
    if (session.audioSink) {
      session.audioSink.pause();
      session.audioSink.srcObject = null;
      session.audioSink.onplaying = null;
      session.audioSink.onpause = null;
      session.audioSink.onended = null;
      session.audioSink = null;
    }
    if (session.remoteTrack) {
      session.remoteTrack.onmute = null;
      session.remoteTrack.onunmute = null;
      session.remoteTrack.onended = null;
      session.remoteTrack = null;
    }
    session.remoteStream = null;
    session.analyser = null;
  }

  private isCurrentAttempt(attempt: number) {
    return !this.stopped && this.connectionAttempt === attempt;
  }

  private ensureCurrentAttempt(attempt: number) {
    if (!this.isCurrentAttempt(attempt)) throw new ConnectionAttemptCancelled();
  }

  private sampleAudio() {
    const now = performance.now();
    const turn = this.currentTurn;

    if (turn) {
      for (const [language, session] of this.sessions) {
        if (session.analyser && rms(session.analyser) >= LIVE_TURN_DETECTION.remoteAudioRmsThreshold) {
          turn.lastRemoteSoundAt[language] = now;
          if (turn.firstAudioAt[language] == null) turn.firstAudioAt[language] = now;
        }
      }
    }

    if (this.snapshot.phase === "speaking") {
      this.sampleGatedInput(now);
      return;
    }
    if (this.finalizing || !this.sourceAnalyser) return;
    const sourceRms = rms(this.sourceAnalyser);
    if (sourceRms >= LIVE_TURN_DETECTION.speechRmsThreshold) {
      this.lastSpeechAt = now;
      this.aboveThresholdFrames += 1;
      if (turn) {
        turn.activeSpeechMs += LIVE_TURN_DETECTION.sampleIntervalMs;
      } else if (this.aboveThresholdFrames >= LIVE_TURN_DETECTION.speechStartFrames) {
        this.beginTurn(now);
      }
      return;
    }

    this.aboveThresholdFrames = 0;
    if (turn) {
      const silenceMs = now - this.lastSpeechAt;
      if (shouldFinishLiveTurn(turn.activeSpeechMs, silenceMs)) {
        void this.finishTurn(now, silenceMs);
      } else if (shouldDiscardNoiseTurn(turn.activeSpeechMs, silenceMs)) {
        this.discardNoiseTurn(turn, now, silenceMs);
      }
    }
  }

  private sampleGatedInput(now: number) {
    if (!this.sourceAnalyser || this.gatedTurnLogged) return;
    if (rms(this.sourceAnalyser) < LIVE_TURN_DETECTION.speechRmsThreshold) {
      this.gatedSpeechFrames = 0;
      return;
    }
    this.gatedSpeechFrames += 1;
    if (this.gatedSpeechFrames < LIVE_TURN_DETECTION.speechStartFrames) return;
    const durationMs = this.gatedSpeechFrames * LIVE_TURN_DETECTION.sampleIntervalMs;
    const endedAtEpochMs = Date.now();
    this.upsertTurn({
      turnId: crypto.randomUUID(),
      startedAt: new Date(endedAtEpochMs - durationMs).toISOString(),
      endedAt: new Date(endedAtEpochMs).toISOString(),
      status: "ignored",
      sourceLanguage: null,
      targetLanguage: null,
      sourceTranscript: "",
      translatedTranscript: "",
      detectedLanguage: "unknown",
      detectionStatus: "not_attempted",
      detectHttpStatus: null,
      detectErrorCode: null,
      selectedSidecar: null,
      discardedSidecar: null,
      turnDurationMs: Math.max(0, Math.round(now - (now - durationMs))),
      silenceDurationMs: null,
      speechEndToFirstTranslationMs: null,
      speechEndToFirstAudioMs: null,
      speechEndToTranslationCompleteMs: null,
      speechEndToAudioCompleteMs: null,
      speechEndToPlaybackStartedMs: null,
      speechStartToFirstTranslationMs: null,
      firstTranslationRelativeToSpeechEndMs: null,
      firstAudioRelativeToSpeechEndMs: null,
      firstRemoteAudioAt: null,
      selectedAudioReadyAt: null,
      playbackStartedAt: null,
      audioCompletedAt: null,
      playbackStarted: false,
      playbackStopped: false,
      errorCode: "input_gated_during_playback",
      sidecars: {
        sw: this.emptySidecarQaData(),
        de: this.emptySidecarQaData(),
      },
    });
    this.gatedTurnLogged = true;
  }

  private emptySidecarQaData() {
    return {
      sourceTranscript: "",
      translatedTranscript: "",
      transcriptStartedAt: null,
      transcriptCompletedAt: null,
      hadRemoteAudio: false,
      remoteTrackReceived: false,
      audioCaptureStarted: false,
      audioBlobSize: null,
      audioErrorCode: null,
    };
  }

  private beginTurn(now: number) {
    if (typeof MediaRecorder === "undefined") {
      this.update({
        phase: "error",
        error: "Live-Übersetzung wird von diesem Browser nicht unterstützt.",
      });
      return;
    }
    const turn: TurnCapture = {
      id: crypto.randomUUID(),
      startedAt: now,
      startedAtEpochMs: Date.now(),
      endedAt: null,
      endedAtEpochMs: null,
      silenceDurationMs: null,
      activeSpeechMs:
        LIVE_TURN_DETECTION.speechStartFrames * LIVE_TURN_DETECTION.sampleIntervalMs,
      sourceTranscripts: { de: "", sw: "" },
      outputTranscripts: { de: "", sw: "" },
      outputTranscriptStartedAt: {},
      outputTranscriptCompletedAt: {},
      firstTranslationAt: {},
      firstAudioAt: {},
      lastRemoteSoundAt: {},
      recorders: new Map(),
      chunks: new Map(),
      audioCaptureErrors: {},
      audioBlobSizes: {},
      performance: new LiveTurnPerformanceTracker(),
    };
    turn.performance.mark("turnStart", now);
    for (const session of this.sessions.values()) this.startTurnRecorder(turn, session);
    this.currentTurn = turn;
    this.update({
      phase: "recognizing",
      detectedLanguage: "unknown",
      targetLanguage: null,
      error: null,
    });
  }

  private handleServerEvent(targetLanguage: LiveLanguage, raw: unknown) {
    const event = parseTranslationServerEvent(raw);
    if (!event) return;
    if (event.type === "error") {
      // Never surface raw provider messages or transcript contents.
      this.failConnection();
      return;
    }
    const turn = this.currentTurn;
    if (!turn) return;

    if (event.type === "session.input_transcript.delta" && typeof event.delta === "string") {
      turn.sourceTranscripts[targetLanguage] += event.delta;
      const detected = detectLiveLanguage(transcriptCandidates(turn)[0] ?? "");
      this.update({
        detectedLanguage: detected,
        targetLanguage: detected === "unknown" ? null : targetForSource(detected),
      });
    }
    if (event.type === "session.output_transcript.delta" && typeof event.delta === "string") {
      turn.outputTranscripts[targetLanguage] += event.delta;
      const now = performance.now();
      if (turn.outputTranscriptStartedAt[targetLanguage] == null) {
        turn.outputTranscriptStartedAt[targetLanguage] = now;
      }
      turn.outputTranscriptCompletedAt[targetLanguage] = now;
      if (turn.firstTranslationAt[targetLanguage] == null) {
        turn.firstTranslationAt[targetLanguage] = now;
      }
    }
  }

  private startTurnRecorder(turn: TurnCapture, session: DirectionSession) {
    const { targetLanguage, remoteStream } = session;
    if (!remoteStream || turn.recorders.has(targetLanguage) || turn.endedAt != null) return;
    try {
      const recorder = new MediaRecorder(remoteStream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        turn.audioCaptureErrors[targetLanguage] = "audio_capture_failed";
      };
      recorder.start(100);
      turn.recorders.set(targetLanguage, recorder);
      turn.chunks.set(targetLanguage, chunks);
    } catch {
      turn.audioCaptureErrors[targetLanguage] = "audio_capture_failed";
    }
  }

  private async finishTurn(now: number, silenceDurationMs: number) {
    const turn = this.currentTurn;
    if (!turn || this.finalizing) return;
    this.finalizing = true;
    turn.endedAt = now;
    turn.endedAtEpochMs = Date.now();
    turn.silenceDurationMs = Math.round(silenceDurationMs);
    turn.performance.mark("turnEnd", now);
    this.setInputEnabled(false);
    this.update({ phase: "translating" });

    const detectionPromise = (async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, LIVE_TURN_DETECTION.transcriptSettleMs),
      );
      return detectLanguageReliably(turn.id, transcriptCandidates(turn));
    })();

    const deadline = now + LIVE_TURN_DETECTION.outputDrainTimeoutMs;
    while (!this.stopped && performance.now() < deadline) {
      const target =
        this.snapshot.detectedLanguage === "unknown"
          ? null
          : targetForSource(this.snapshot.detectedLanguage);
      const lastSound = target ? turn.lastRemoteSoundAt[target] : null;
      if (lastSound != null && performance.now() - lastSound >= LIVE_TURN_DETECTION.outputTailSilenceMs) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const blobs = await this.stopRecorders(turn);
    for (const [language, blob] of blobs) turn.audioBlobSizes[language] = blob.size;
    const detection = await detectionPromise;
    if (this.stopped || this.currentTurn !== turn) return;
    const sourceLanguage = detection.language;
    if (detection.status === "skipped") {
      this.upsertTurn(this.createTurnRecord(turn, {
        status: "empty",
        sourceTranscript: "",
        detection,
        errorCode: "empty_transcript",
      }));
      this.resumeAfterTurn("Keine verwertbare Sprache erkannt.");
      return;
    }
    if (sourceLanguage === "unknown") {
      this.upsertTurn(this.createTurnRecord(turn, {
        status: detection.status === "error" ? "detect_error" : "unknown",
        sourceTranscript: detection.transcript,
        detection,
        errorCode: detection.errorCode ?? "unknown_language",
      }));
      this.resumeAfterTurn("Sprache konnte nicht sicher erkannt werden.");
      return;
    }

    const targetLanguage = targetForSource(sourceLanguage);
    const blob = blobs.get(targetLanguage);
    const translatedText = turn.outputTranscripts[targetLanguage].trim();
    const sourceText = detection.transcript;
    const firstTranslation = turn.firstTranslationAt[targetLanguage];
    const firstAudio = turn.firstAudioAt[targetLanguage];
    if (firstTranslation != null) turn.performance.mark("translationFirstDelta", firstTranslation);
    if (firstAudio != null) turn.performance.mark("audioFirstOutput", firstAudio);
    turn.performance.mark("translationCompleted");

    const record = this.createTurnRecord(turn, {
      status: sourceText && translatedText ? "success" : "technical_error",
      sourceTranscript: sourceText,
      translatedTranscript: translatedText,
      detection,
      sourceLanguage,
      targetLanguage,
      errorCode: sourceText && translatedText ? null : "missing_translation",
    });
    this.upsertTurn(record);
    this.update({ detectedLanguage: sourceLanguage, targetLanguage });

    const audioErrorCode = this.selectedAudioError(turn, targetLanguage, blob);
    if (audioErrorCode) {
      this.updateTurnAudioError(turn.id, targetLanguage, audioErrorCode);
      this.resumeAfterTurn("Live-Übersetzung ist gerade nicht verfügbar.");
      return;
    }
    await this.playSelectedAudio(turn, blob!, sourceLanguage, targetLanguage);
  }

  private selectedAudioError(
    turn: TurnCapture,
    targetLanguage: LiveLanguage,
    blob: Blob | undefined,
  ) {
    const session = this.sessions.get(targetLanguage);
    if (!session?.remoteTrack || !session.remoteStream) return "remote_audio_track_missing";
    if (turn.audioCaptureErrors[targetLanguage]) return "audio_capture_failed";
    if (!turn.recorders.has(targetLanguage)) return "audio_capture_failed";
    if (turn.firstAudioAt[targetLanguage] == null) return "no_audio_frames_for_turn";
    if (!blob || blob.size === 0) return "selected_sidecar_audio_missing";
    return null;
  }

  private async playSelectedAudio(
    turn: TurnCapture,
    blob: Blob,
    sourceLanguage: LiveLanguage,
    targetLanguage: LiveLanguage,
  ) {
    if (this.stopped || this.currentTurn !== turn || this.playbackAudio) return;
    const readyAt = performance.now();
    turn.performance.mark("selectedAudioReady", readyAt);
    const objectUrl = URL.createObjectURL(blob);
    const audio = this.preparedPlaybackAudio ?? new Audio();
    this.preparedPlaybackAudio = null;
    audio.preload = "auto";
    audio.setAttribute("playsinline", "");
    audio.src = objectUrl;
    audio.load();
    this.playbackAudio = audio;
    this.playbackObjectUrl = objectUrl;
    this.playbackTurnId = turn.id;
    this.gatedSpeechFrames = 0;
    this.gatedTurnLogged = false;
    this.updateTurn(turn.id, {
      selectedAudioReadyAt: this.performanceTimeToIso(turn, readyAt),
    });

    let playbackStarted = false;
    let playbackFinished = false;
    const finishWithError = (errorCode: "playback_blocked" | "playback_failed") => {
      if (playbackFinished) return;
      playbackFinished = true;
      this.updateTurnAudioError(turn.id, targetLanguage, errorCode, {
        playbackStopped: playbackStarted,
      });
      this.releasePlaybackAudio(audio, objectUrl);
      this.resumeAfterTurn("Audio konnte nicht wiedergegeben werden.");
    };
    const markPlaying = () => {
      if (playbackStarted || playbackFinished) return;
      playbackStarted = true;
      const startedAt = performance.now();
      turn.performance.mark("playbackStarted", startedAt);
      const result = turn.performance.result(sourceLanguage, targetLanguage);
      logRemoteAudio(targetLanguage, "playing");
      this.updateTurn(turn.id, {
        playbackStarted: true,
        playbackStartedAt: this.performanceTimeToIso(turn, startedAt),
        speechEndToPlaybackStartedMs: result.speechEndToPlaybackStartedMs,
      });
      this.update({ phase: "speaking", audioPlaying: true, error: null });
    };

    audio.onplaying = markPlaying;
    audio.onpause = () => logRemoteAudio(targetLanguage, "paused");
    audio.onerror = () => finishWithError("playback_failed");
    audio.onended = () => {
      if (playbackFinished) return;
      markPlaying();
      playbackFinished = true;
      const completedAt = performance.now();
      turn.performance.mark("audioCompleted", completedAt);
      const result = turn.performance.result(sourceLanguage, targetLanguage);
      logRemoteAudio(targetLanguage, "ended");
      logLiveTurnPerformance(result);
      this.updateTurn(turn.id, {
        playbackStopped: true,
        audioCompletedAt: this.performanceTimeToIso(turn, completedAt),
        speechEndToAudioCompleteMs: result.speechEndToAudioCompleteMs,
      });
      this.releasePlaybackAudio(audio, objectUrl);
      this.resumeListening();
    };

    try {
      await audio.play();
      markPlaying();
    } catch (error) {
      finishWithError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "playback_blocked"
          : "playback_failed",
      );
    }
  }

  private releasePlaybackAudio(audio: HTMLAudioElement, objectUrl: string) {
    audio.onplaying = null;
    audio.onpause = null;
    audio.onerror = null;
    audio.onended = null;
    audio.removeAttribute("src");
    audio.load();
    if (this.playbackAudio === audio) this.playbackAudio = null;
    if (this.playbackObjectUrl === objectUrl) this.playbackObjectUrl = null;
    URL.revokeObjectURL(objectUrl);
    this.playbackTurnId = null;
    if (!this.stopped) this.preparedPlaybackAudio = audio;
  }

  private performanceTimeToIso(turn: TurnCapture, at: number | undefined) {
    if (at == null) return null;
    return new Date(turn.startedAtEpochMs + (at - turn.startedAt)).toISOString();
  }

  private createTurnRecord(
    turn: TurnCapture,
    input: {
      status: LiveTranscriptTurn["status"];
      sourceTranscript: string;
      translatedTranscript?: string;
      detection: DetectionResult;
      sourceLanguage?: LiveLanguage;
      targetLanguage?: LiveLanguage;
      errorCode: string | null;
    },
  ): LiveTranscriptTurn {
    const performanceResult = input.sourceLanguage && input.targetLanguage
      ? turn.performance.result(input.sourceLanguage, input.targetLanguage)
      : null;
    return {
      turnId: turn.id,
      startedAt: new Date(turn.startedAtEpochMs).toISOString(),
      endedAt: turn.endedAtEpochMs == null
        ? null
        : new Date(turn.endedAtEpochMs).toISOString(),
      status: input.status,
      sourceLanguage: input.sourceLanguage ?? input.detection.language,
      targetLanguage: input.targetLanguage ?? null,
      sourceTranscript: input.sourceTranscript,
      translatedTranscript: input.translatedTranscript ?? "",
      detectedLanguage: input.detection.language,
      detectionStatus: input.detection.status,
      detectHttpStatus: input.detection.httpStatus,
      detectErrorCode: input.detection.errorCode,
      selectedSidecar: input.targetLanguage ?? null,
      discardedSidecar: input.targetLanguage
        ? input.targetLanguage === "de" ? "sw" : "de"
        : null,
      turnDurationMs: turn.endedAt == null
        ? null
        : Math.max(0, Math.round(turn.endedAt - turn.startedAt)),
      silenceDurationMs: turn.silenceDurationMs,
      speechEndToFirstTranslationMs:
        performanceResult?.speechEndToFirstTranslationMs ?? null,
      speechEndToFirstAudioMs: performanceResult?.speechEndToFirstAudioMs ?? null,
      speechEndToTranslationCompleteMs:
        performanceResult?.speechEndToTranslationCompleteMs ?? null,
      speechEndToAudioCompleteMs:
        performanceResult?.speechEndToAudioCompleteMs ?? null,
      speechEndToPlaybackStartedMs:
        performanceResult?.speechEndToPlaybackStartedMs ?? null,
      speechStartToFirstTranslationMs:
        performanceResult?.speechStartToFirstTranslationMs ?? null,
      firstTranslationRelativeToSpeechEndMs:
        performanceResult?.firstTranslationRelativeToSpeechEndMs ?? null,
      firstAudioRelativeToSpeechEndMs:
        performanceResult?.firstAudioRelativeToSpeechEndMs ?? null,
      firstRemoteAudioAt: input.targetLanguage
        ? this.performanceTimeToIso(turn, turn.firstAudioAt[input.targetLanguage])
        : null,
      selectedAudioReadyAt: null,
      playbackStartedAt: null,
      audioCompletedAt: null,
      playbackStarted: false,
      playbackStopped: false,
      errorCode: input.errorCode,
      sidecars: {
        sw: this.sidecarQaData(turn, "sw"),
        de: this.sidecarQaData(turn, "de"),
      },
    };
  }

  private sidecarQaData(turn: TurnCapture, targetLanguage: LiveLanguage) {
    const session = this.sessions.get(targetLanguage);
    return {
      sourceTranscript: turn.sourceTranscripts[targetLanguage].trim(),
      translatedTranscript: turn.outputTranscripts[targetLanguage].trim(),
      transcriptStartedAt: this.performanceTimeToIso(
        turn,
        turn.outputTranscriptStartedAt[targetLanguage],
      ),
      transcriptCompletedAt: this.performanceTimeToIso(
        turn,
        turn.outputTranscriptCompletedAt[targetLanguage],
      ),
      hadRemoteAudio: turn.firstAudioAt[targetLanguage] != null,
      remoteTrackReceived: Boolean(session?.remoteTrack),
      audioCaptureStarted: turn.recorders.has(targetLanguage),
      audioBlobSize: turn.audioBlobSizes[targetLanguage] ?? null,
      audioErrorCode: turn.audioCaptureErrors[targetLanguage] ?? null,
    };
  }

  private upsertTurn(turn: LiveTranscriptTurn) {
    const index = this.snapshot.transcript.findIndex(
      (candidate) => candidate.turnId === turn.turnId,
    );
    const transcript = [...this.snapshot.transcript];
    if (index === -1) transcript.push(turn);
    else transcript[index] = turn;
    this.update({ transcript });
  }

  private updateTurn(turnId: string, patch: Partial<LiveTranscriptTurn>) {
    const transcript = this.snapshot.transcript.map((turn) =>
      turn.turnId === turnId ? { ...turn, ...patch } : turn
    );
    this.update({ transcript });
  }

  private updateTurnAudioError(
    turnId: string,
    targetLanguage: LiveLanguage,
    errorCode: string,
    patch: Partial<LiveTranscriptTurn> = {},
  ) {
    const turn = this.snapshot.transcript.find((item) => item.turnId === turnId);
    if (!turn) return;
    this.updateTurn(turnId, {
      ...patch,
      status: "technical_error",
      errorCode,
      sidecars: {
        ...turn.sidecars,
        [targetLanguage]: {
          ...turn.sidecars[targetLanguage],
          audioErrorCode: errorCode,
        },
      },
    });
  }

  private discardNoiseTurn(turn: TurnCapture, now: number, silenceDurationMs: number) {
    turn.endedAt = now;
    turn.endedAtEpochMs = Date.now();
    turn.silenceDurationMs = Math.round(silenceDurationMs);
    turn.performance.mark("turnEnd", now);
    const candidates = transcriptCandidates(turn);
    const transcript = candidates[0] ?? "";
    this.upsertTurn(this.createTurnRecord(turn, {
      status: "discarded",
      sourceTranscript: transcript,
      detection: {
        language: detectLiveLanguage(transcript),
        status: "skipped",
        httpStatus: null,
        errorCode: "insufficient_speech_activity",
        transcript,
        candidateCount: candidates.length,
      },
      errorCode: "insufficient_speech_activity",
    }));
    void this.stopRecorders(turn);
    this.resumeAfterTurn("Turn verworfen – keine verwertbare Sprache erkannt.");
  }

  private resumeAfterTurn(error: string | null) {
    this.setInputEnabled(true);
    this.currentTurn = null;
    this.finalizing = false;
    this.gatedSpeechFrames = 0;
    this.gatedTurnLogged = false;
    this.update({
      phase: "listening",
      audioPlaying: false,
      detectedLanguage: "unknown",
      targetLanguage: null,
      error,
    });
  }

  private recordInterruptedTurn(errorCode: string) {
    const turn = this.currentTurn;
    if (!turn) return;
    for (const recorder of turn.recorders.values()) {
      if (recorder.state !== "inactive") recorder.stop();
    }
    const existing = this.snapshot.transcript.find(
      (candidate) => candidate.turnId === turn.id,
    );
    if (existing) {
      this.updateTurn(turn.id, {
        playbackStopped: existing.playbackStarted || existing.playbackStopped,
        errorCode: existing.errorCode ?? errorCode,
      });
      return;
    }
    const now = performance.now();
    turn.endedAt = now;
    turn.endedAtEpochMs = Date.now();
    turn.silenceDurationMs = Math.max(0, Math.round(now - this.lastSpeechAt));
    turn.performance.mark("turnEnd", now);
    const candidates = transcriptCandidates(turn);
    const transcript = candidates[0] ?? "";
    this.upsertTurn(this.createTurnRecord(turn, {
      status: "discarded",
      sourceTranscript: transcript,
      detection: {
        language: detectLiveLanguage(transcript),
        status: "not_attempted",
        httpStatus: null,
        errorCode: null,
        transcript,
        candidateCount: candidates.length,
      },
      errorCode,
    }));
  }

  private stopRecorders(turn: TurnCapture) {
    const entries = [...turn.recorders.entries()];
    return Promise.all(
      entries.map(
        ([language, recorder]) =>
          new Promise<[LiveLanguage, Blob]>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              resolve([
                language,
                new Blob(turn.chunks.get(language) ?? [], { type: recorder.mimeType }),
              ]);
            };
            const timeout = setTimeout(() => {
              turn.audioCaptureErrors[language] = "audio_capture_failed";
              finish();
            }, LIVE_TURN_DETECTION.recorderStopTimeoutMs);
            recorder.onstop = finish;
            try {
              if (recorder.state === "inactive") finish();
              else recorder.stop();
            } catch {
              turn.audioCaptureErrors[language] = "audio_capture_failed";
              finish();
            }
          }),
      ),
    ).then((values) => new Map(values));
  }

  private resumeListening() {
    this.resumeAfterTurn(null);
  }

  private setInputEnabled(enabled: boolean) {
    this.sourceStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  private failConnection() {
    if (this.stopped) return;
    this.recordInterruptedTurn("connection_lost");
    this.setInputEnabled(false);
    this.update({
      phase: "error",
      connectionStatus: "disconnected",
      error: "Live-Verbindung wurde unterbrochen.",
    });
  }

  private teardown(markStopped: boolean) {
    this.stopped = true;
    this.connectionAttempt += 1;
    this.connectionAbortController?.abort();
    this.connectionAbortController = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopAudio();
    if (this.preparedPlaybackAudio) {
      this.preparedPlaybackAudio.pause();
      this.preparedPlaybackAudio.removeAttribute("src");
      this.preparedPlaybackAudio.load();
      this.preparedPlaybackAudio = null;
    }
    for (const session of this.sessions.values()) {
      if (session.events.readyState === "open") {
        session.events.send(JSON.stringify({ type: "session.close" }));
      }
      session.peer.onconnectionstatechange = null;
      session.peer.oniceconnectionstatechange = null;
      session.peer.onsignalingstatechange = null;
      session.peer.onicegatheringstatechange = null;
      this.cleanupDirectionAudio(session);
      session.peer.close();
    }
    this.sessions.clear();
    this.sourceStream?.getTracks().forEach((track) => track.stop());
    this.sourceStream = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.sourceAnalyser = null;
    this.currentTurn = null;
    this.finalizing = false;
    if (activeClient === this) activeClient = null;
    if (!markStopped) this.stopped = false;
  }

  private update(patch: Partial<LiveClientSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}
