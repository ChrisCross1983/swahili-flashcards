import { requestTranslatorSpeech } from "@/lib/translator/speechClient";
import { LIVE_TURN_DETECTION } from "../config";
import { shouldDiscardNoiseTurn, shouldFinishLiveTurn } from "../turnDetection";
import { targetForSource } from "../languageDetection";
import type { LiveLanguage } from "../types";
import { detectLiveV2Language, translateLiveV2Text } from "./apiClient";
import { LIVE_V2_CONFIG, isLiveV2TtsSpeed } from "./config";
import { RealtimeTranscriptionClientV2 } from "./realtimeTranscriptionClient";
import { buildLiveV2Report, liveV2ReportFilename } from "./report";
import { liveV2DevelopmentLog } from "./diagnostics";
import type { LiveV2Snapshot, LiveV2Turn } from "./types";

type Listener = (snapshot: LiveV2Snapshot) => void;

type TranscriptionTransport = {
  connect: (stream: MediaStream) => Promise<void>;
  finalizeTurn: () => Promise<string>;
  clearTurn: () => void;
  disconnect: () => void;
};

type AudioLike = Pick<
  HTMLAudioElement,
  "currentTime" | "load" | "onended" | "onerror" | "onplaying" | "pause" | "play" | "preload" | "src"
> & { setAttribute: (name: string, value: string) => void };

type LiveV2Dependencies = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createAudioContext: () => AudioContext;
  createTransport: (handlers: {
    onDelta: (delta: string) => void;
    onError: () => void;
    onConnectionAttempt: (details: {
      attempt: number;
      httpStatus: number;
      requestId: string | null;
    }) => void;
  }) => TranscriptionTransport;
  detectLanguage: typeof detectLiveV2Language;
  translate: typeof translateLiveV2Text;
  requestSpeech: typeof requestTranslatorSpeech;
  createAudio: () => AudioLike;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  now: () => number;
  randomId: () => string;
};

type ActiveTurn = {
  turnId: string;
  speechStartMs: number;
  speechEndMs: number | null;
  activeSpeechMs: number;
  silenceDurationMs: number | null;
  expectedLanguage: LiveLanguage | null;
  partialTranscript: string;
  firstTranscriptDeltaMs: number | null;
};

const INITIAL_SNAPSHOT: LiveV2Snapshot = {
  pipelineVersion: "v2",
  phase: "idle",
  connectionStatus: "idle",
  authoritativeTranscript: "",
  expectedLanguage: null,
  detectedLanguage: "unknown",
  targetLanguage: null,
  turns: [],
  error: null,
  audioPlaying: false,
  sessionId: null,
  ttsSpeed: LIVE_V2_CONFIG.ttsSpeed.default,
};

let activeClient: LiveV2Client | null = null;

function claimClient(client: LiveV2Client) {
  if (activeClient && activeClient !== client) return false;
  activeClient = client;
  return true;
}

function rms(analyser: AnalyserNode) {
  const values = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(values);
  let sum = 0;
  for (const value of values) {
    const normalized = (value - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / values.length);
}

function iso(value: number | null) {
  return value === null ? null : new Date(value).toISOString();
}

function duration(from: number | null, to: number | null) {
  return from === null || to === null ? null : Math.round(to - from);
}

function defaultDependencies(): LiveV2Dependencies {
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createAudioContext: () => new window.AudioContext(),
    createTransport: (handlers) => new RealtimeTranscriptionClientV2(handlers),
    detectLanguage: detectLiveV2Language,
    translate: translateLiveV2Text,
    requestSpeech: requestTranslatorSpeech,
    createAudio: () => new Audio(),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    now: () => Date.now(),
    randomId: () => crypto.randomUUID(),
  };
}

export class LiveV2Client {
  private snapshot: LiveV2Snapshot = { ...INITIAL_SNAPSHOT };
  private readonly listeners = new Set<Listener>();
  private readonly dependencies: LiveV2Dependencies;
  private sourceStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceAnalyser: AnalyserNode | null = null;
  private transport: TranscriptionTransport | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private turn: ActiveTurn | null = null;
  private lastSpeechAt = 0;
  private aboveThresholdFrames = 0;
  private finalizing = false;
  private operation = 0;
  private requestController: AbortController | null = null;
  private playbackAudio: AudioLike | null = null;
  private playbackUrl: string | null = null;
  private playbackStop: (() => void) | null = null;
  private preparedAudio: AudioLike | null = null;
  private sessionStartedAt: string | null = null;
  private sessionEndedAt: string | null = null;
  private expectedNext: LiveLanguage | null = null;
  private realtimeRequestIds: string[] = [];

  constructor(dependencies: Partial<LiveV2Dependencies> = {}) {
    this.dependencies = { ...defaultDependencies(), ...dependencies };
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this.snapshot;
  }

  setTtsSpeed(speed: number) {
    if (!isLiveV2TtsSpeed(speed)) return false;
    this.update({ ttsSpeed: speed });
    return true;
  }

  getTestReport() {
    if (!this.snapshot.sessionId || !this.sessionStartedAt) return null;
    return buildLiveV2Report({
      sessionId: this.snapshot.sessionId,
      startedAt: this.sessionStartedAt,
      endedAt: this.sessionEndedAt,
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      platform: typeof navigator === "undefined" ? "" : navigator.platform,
      ttsSpeed: this.snapshot.ttsSpeed,
      realtimeRequestIds: this.realtimeRequestIds,
      turns: this.snapshot.turns,
    });
  }

  exportTestReport() {
    const report = this.getTestReport();
    if (!report || typeof document === "undefined") return false;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = this.dependencies.createObjectUrl(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = liveV2ReportFilename();
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => this.dependencies.revokeObjectUrl(url), 0);
    return true;
  }

  async start() {
    if (!claimClient(this)) {
      this.update({
        phase: "error",
        connectionStatus: "disconnected",
        error: "Es läuft bereits ein Live-Gespräch.",
      });
      return;
    }
    if (["connecting", "connected"].includes(this.snapshot.connectionStatus)) return;
    const operation = ++this.operation;
    liveV2DevelopmentLog("lifecycle", {
      event: "start_requested",
      operation,
    });
    if (!this.snapshot.sessionId || this.sessionEndedAt) {
      const sessionId = this.dependencies.randomId();
      this.sessionStartedAt = new Date(this.dependencies.now()).toISOString();
      this.sessionEndedAt = null;
      this.expectedNext = null;
      this.realtimeRequestIds = [];
      this.update({ turns: [], sessionId, expectedLanguage: null });
    }
    this.update({
      phase: "connecting",
      connectionStatus: "connecting",
      error: null,
      authoritativeTranscript: "",
    });

    try {
      this.preparedAudio ??= this.dependencies.createAudio();
      this.preparedAudio.preload = "auto";
      this.preparedAudio.setAttribute("playsinline", "");
      const audioContext = this.dependencies.createAudioContext();
      this.audioContext = audioContext;
      await audioContext.resume();
      const stream = await this.dependencies.getUserMedia({
        audio: LIVE_V2_CONFIG.audioConstraints,
      });
      if (operation !== this.operation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.sourceStream = stream;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      this.sourceAnalyser = analyser;

      const transport = this.dependencies.createTransport({
        onDelta: (delta) => this.receiveTranscriptDelta(delta),
        onError: () => this.handleConnectionError(),
        onConnectionAttempt: ({ requestId }) => {
          if (operation !== this.operation || !requestId) return;
          if (!this.realtimeRequestIds.includes(requestId)) {
            this.realtimeRequestIds = [...this.realtimeRequestIds, requestId];
          }
        },
      });
      this.transport = transport;
      await transport.connect(stream);
      if (operation !== this.operation) return;
      this.timer = setInterval(
        () => this.sampleAudio(),
        LIVE_TURN_DETECTION.sampleIntervalMs,
      );
      liveV2DevelopmentLog("lifecycle", {
        event: "connected",
        operation,
        pipelineVersion: "v2",
        transcriptionSessions: 1,
        transcriptionModel: LIVE_V2_CONFIG.transcriptionModel,
        turnPauseMs: LIVE_V2_CONFIG.turnSilenceMs,
      });
      this.update({ phase: "listening", connectionStatus: "connected", error: null });
    } catch (error) {
      if (operation !== this.operation) return;
      this.teardown(false, "start_failed");
      this.update({
        phase: "error",
        connectionStatus: "disconnected",
        error:
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Mikrofon konnte nicht geöffnet werden."
            : "Live-Übersetzung ist gerade nicht verfügbar.",
      });
    }
  }

  async reconnect() {
    this.teardown(false, "reconnect");
    this.update({ phase: "connecting", connectionStatus: "reconnecting", error: null });
    await this.start();
  }

  stopAudio() {
    this.playbackStop?.();
  }

  stop() {
    if (this.turn) this.recordInterruptedTurn();
    if (!this.sessionEndedAt && this.sessionStartedAt) {
      this.sessionEndedAt = new Date(this.dependencies.now()).toISOString();
    }
    this.teardown(true, "stop");
    this.update({
      ...INITIAL_SNAPSHOT,
      turns: this.snapshot.turns,
      sessionId: this.snapshot.sessionId,
      ttsSpeed: this.snapshot.ttsSpeed,
    });
  }

  private sampleAudio() {
    if (this.finalizing || this.snapshot.phase === "speaking" || !this.sourceAnalyser) return;
    const now = this.dependencies.now();
    const level = rms(this.sourceAnalyser);
    if (level >= LIVE_TURN_DETECTION.speechRmsThreshold) {
      this.lastSpeechAt = now;
      this.aboveThresholdFrames += 1;
      if (this.turn) {
        this.turn.activeSpeechMs += LIVE_TURN_DETECTION.sampleIntervalMs;
      } else if (this.aboveThresholdFrames >= LIVE_TURN_DETECTION.speechStartFrames) {
        this.beginTurn(now);
      }
      return;
    }
    this.aboveThresholdFrames = 0;
    if (!this.turn) return;
    const silenceMs = now - this.lastSpeechAt;
    if (shouldFinishLiveTurn(this.turn.activeSpeechMs, silenceMs)) {
      void this.finishTurn(now, silenceMs);
    } else if (shouldDiscardNoiseTurn(this.turn.activeSpeechMs, silenceMs)) {
      this.discardNoiseTurn(now, silenceMs);
    }
  }

  private beginTurn(now: number) {
    this.turn = {
      turnId: this.dependencies.randomId(),
      speechStartMs: now,
      speechEndMs: null,
      activeSpeechMs:
        LIVE_TURN_DETECTION.speechStartFrames * LIVE_TURN_DETECTION.sampleIntervalMs,
      silenceDurationMs: null,
      expectedLanguage: this.expectedNext,
      partialTranscript: "",
      firstTranscriptDeltaMs: null,
    };
    this.update({
      phase: "recognizing",
      authoritativeTranscript: "",
      expectedLanguage: this.expectedNext,
      detectedLanguage: "unknown",
      targetLanguage: null,
      error: null,
    });
  }

  private receiveTranscriptDelta(delta: string) {
    const turn = this.turn;
    if (!turn || this.finalizing && turn.speechEndMs === null) return;
    turn.partialTranscript += delta;
    turn.firstTranscriptDeltaMs ??= this.dependencies.now();
    this.update({ authoritativeTranscript: turn.partialTranscript });
  }

  private async finishTurn(now: number, silenceMs: number) {
    const turn = this.turn;
    const transport = this.transport;
    if (!turn || !transport || this.finalizing) return;
    this.finalizing = true;
    turn.speechEndMs = now;
    turn.silenceDurationMs = Math.round(silenceMs);
    this.setMicrophoneEnabled(false);
    const operation = this.operation;

    try {
      const authoritativeTranscript = (await transport.finalizeTurn()).trim();
      const transcriptFinalMs = this.dependencies.now();
      if (operation !== this.operation || this.turn !== turn) return;
      this.update({ authoritativeTranscript });
      if (!authoritativeTranscript || !/[\p{L}\p{N}]/u.test(authoritativeTranscript)) {
        this.appendTurn(this.makeTurn(turn, {
          status: "empty",
          errorCode: "empty_authoritative_transcript",
          authoritativeTranscript,
          transcriptFinalMs,
        }));
        this.resumeListening("Kein verwertbares Transkript empfangen.");
        return;
      }

      this.requestController = new AbortController();
      const language = await this.dependencies.detectLanguage(
        authoritativeTranscript,
        turn.expectedLanguage,
        this.requestController.signal,
      );
      const languageResolvedMs = this.dependencies.now();
      if (operation !== this.operation || this.turn !== turn) return;
      if (language.language === "unknown") {
        this.appendTurn(this.makeTurn(turn, {
          status: "unknown",
          errorCode: "unknown_language",
          authoritativeTranscript,
          transcriptFinalMs,
          languageResolvedMs,
          detectedLanguage: "unknown",
          classificationSource: "terra",
        }));
        this.resumeListening("Sprache konnte nicht sicher erkannt werden.");
        return;
      }

      const sourceLanguage = language.language;
      const targetLanguage = targetForSource(sourceLanguage);
      this.expectedNext = targetLanguage;
      this.update({
        phase: "translating",
        detectedLanguage: sourceLanguage,
        targetLanguage,
        expectedLanguage: turn.expectedLanguage,
      });
      const translationStartedMs = this.dependencies.now();
      const translation = await this.dependencies.translate(
        authoritativeTranscript,
        sourceLanguage,
        targetLanguage,
        this.requestController.signal,
      );
      const translationCompletedMs = this.dependencies.now();
      if (operation !== this.operation || this.turn !== turn) return;
      const pendingRecord = this.makeTurn(turn, {
        status: "success",
        errorCode: null,
        authoritativeTranscript,
        transcriptFinalMs,
        languageResolvedMs,
        detectedLanguage: sourceLanguage,
        classificationSource: "terra",
        targetLanguage,
        translatedText: translation.translatedText,
        translationStartedMs,
        translationCompletedMs,
      });
      this.appendTurn(pendingRecord);

      const ttsStartedMs = this.dependencies.now();
      this.patchTurn(turn.turnId, { ttsStartedAt: iso(ttsStartedMs) });
      const speech = await this.dependencies.requestSpeech(
        translation.translatedText,
        targetLanguage,
        this.snapshot.ttsSpeed,
        { signal: this.requestController.signal },
      );
      if (operation !== this.operation || this.turn !== turn) return;
      await this.playSpeech(turn, speech.audio, ttsStartedMs);
    } catch {
      if (operation !== this.operation || !this.turn || this.turn !== turn) return;
      this.finishPlaybackAudio();
      const existing = this.snapshot.turns.find((item) => item.turnId === turn.turnId);
      if (existing) {
        this.patchTurn(turn.turnId, { status: "technical_error", errorCode: "v2_turn_failed" });
      } else {
        this.appendTurn(this.makeTurn(turn, {
          status: "technical_error",
          errorCode: "v2_turn_failed",
          authoritativeTranscript: turn.partialTranscript.trim(),
        }));
      }
      this.resumeListening("Live-Übersetzung ist gerade nicht verfügbar.");
    } finally {
      this.requestController = null;
    }
  }

  private playSpeech(turn: ActiveTurn, audioBlob: Blob, ttsStartedMs: number) {
    return new Promise<void>((resolve, reject) => {
      const url = this.dependencies.createObjectUrl(audioBlob);
      const audio = this.preparedAudio ?? this.dependencies.createAudio();
      this.preparedAudio = null;
      this.playbackAudio = audio;
      this.playbackUrl = url;
      audio.preload = "auto";
      audio.setAttribute("playsinline", "");
      audio.src = url;
      audio.load();
      let firstAudioMs: number | null = null;
      let settled = false;

      const cleanup = () => {
        audio.onplaying = null;
        audio.onended = null;
        audio.onerror = null;
      };
      const markPlaying = () => {
        if (firstAudioMs !== null) return;
        firstAudioMs = this.dependencies.now();
        this.patchTurn(turn.turnId, {
          firstAudioAt: iso(firstAudioMs),
          speechEndToFirstAudioMs: duration(turn.speechEndMs, firstAudioMs),
          ttsStartedAt: iso(ttsStartedMs),
        });
        this.update({ phase: "speaking", audioPlaying: true });
      };
      audio.onplaying = markPlaying;
      const complete = (stoppedByUser: boolean) => {
        if (settled) return;
        settled = true;
        const completedMs = this.dependencies.now();
        const startedAt = firstAudioMs ?? completedMs;
        this.patchTurn(turn.turnId, {
          firstAudioAt: iso(startedAt),
          audioCompletedAt: iso(completedMs),
          speechEndToFirstAudioMs: duration(turn.speechEndMs, startedAt),
          totalTurnMs: duration(turn.speechStartMs, completedMs),
          ...(stoppedByUser ? { errorCode: "playback_stopped_by_user" } : {}),
        });
        cleanup();
        this.playbackStop = null;
        this.finishPlaybackAudio();
        this.resumeListening();
        resolve();
      };
      this.playbackStop = () => complete(true);
      audio.onended = () => complete(false);
      audio.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.playbackStop = null;
        this.finishPlaybackAudio();
        reject(new Error("playback_failed"));
      };
      void audio.play().then(
        () => markPlaying(),
        (error) => reject(error),
      );
    });
  }

  private makeTurn(
    turn: ActiveTurn,
    values: {
      status: LiveV2Turn["status"];
      errorCode: string | null;
      authoritativeTranscript: string;
      transcriptFinalMs?: number | null;
      languageResolvedMs?: number | null;
      detectedLanguage?: LiveV2Turn["detectedLanguage"];
      classificationSource?: LiveV2Turn["classificationSource"];
      targetLanguage?: LiveLanguage | null;
      translatedText?: string;
      translationStartedMs?: number | null;
      translationCompletedMs?: number | null;
    },
  ): LiveV2Turn {
    const transcriptFinalMs = values.transcriptFinalMs ?? null;
    const languageResolvedMs = values.languageResolvedMs ?? null;
    const translationStartedMs = values.translationStartedMs ?? null;
    const translationCompletedMs = values.translationCompletedMs ?? null;
    return {
      pipelineVersion: "v2",
      turnId: turn.turnId,
      status: values.status,
      errorCode: values.errorCode,
      authoritativeTranscript: values.authoritativeTranscript,
      expectedLanguage: turn.expectedLanguage,
      detectedLanguage: values.detectedLanguage ?? "unknown",
      classificationSource: values.classificationSource ?? "none",
      targetLanguage: values.targetLanguage ?? null,
      translatedText: values.translatedText ?? "",
      transcriptionModel: LIVE_V2_CONFIG.transcriptionModel,
      translationModel: LIVE_V2_CONFIG.translationModel,
      ttsModel: LIVE_V2_CONFIG.ttsModel,
      ttsSpeed: this.snapshot.ttsSpeed,
      silenceDurationMs: turn.silenceDurationMs,
      speechStartAt: iso(turn.speechStartMs)!,
      speechEndAt: iso(turn.speechEndMs),
      firstTranscriptDeltaAt: iso(turn.firstTranscriptDeltaMs),
      transcriptFinalAt: iso(transcriptFinalMs),
      languageResolvedAt: iso(languageResolvedMs),
      translationStartedAt: iso(translationStartedMs),
      translationCompletedAt: iso(translationCompletedMs),
      ttsStartedAt: null,
      firstAudioAt: null,
      audioCompletedAt: null,
      speechEndToTranscriptFinalMs: duration(turn.speechEndMs, transcriptFinalMs),
      speechEndToLanguageResolvedMs: duration(turn.speechEndMs, languageResolvedMs),
      speechEndToTranslationMs: duration(turn.speechEndMs, translationCompletedMs),
      speechEndToFirstAudioMs: null,
      totalTurnMs: duration(turn.speechStartMs, translationCompletedMs),
    };
  }

  private discardNoiseTurn(now: number, silenceMs: number) {
    const turn = this.turn;
    if (!turn) return;
    turn.speechEndMs = now;
    turn.silenceDurationMs = Math.round(silenceMs);
    this.appendTurn(this.makeTurn(turn, {
      status: "discarded",
      errorCode: "insufficient_speech_activity",
      authoritativeTranscript: turn.partialTranscript.trim(),
    }));
    this.resumeListening("Turn verworfen – keine verwertbare Sprache erkannt.");
  }

  private recordInterruptedTurn() {
    const turn = this.turn;
    if (!turn) return;
    turn.speechEndMs ??= this.dependencies.now();
    this.appendTurn(this.makeTurn(turn, {
      status: "discarded",
      errorCode: "session_ended",
      authoritativeTranscript: turn.partialTranscript.trim(),
    }));
  }

  private resumeListening(error: string | null = null) {
    this.turn = null;
    this.finalizing = false;
    this.aboveThresholdFrames = 0;
    this.transport?.clearTurn();
    this.setMicrophoneEnabled(true);
    this.update({
      phase: "listening",
      authoritativeTranscript: "",
      expectedLanguage: this.expectedNext,
      detectedLanguage: "unknown",
      targetLanguage: null,
      audioPlaying: false,
      error,
    });
  }

  private setMicrophoneEnabled(enabled: boolean) {
    this.sourceStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  private finishPlaybackAudio() {
    const audio = this.playbackAudio;
    if (audio) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // Seeking can fail before metadata is available.
      }
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      audio.src = "";
      audio.load();
      if (this.operation > 0) this.preparedAudio = audio;
    }
    if (this.playbackUrl) this.dependencies.revokeObjectUrl(this.playbackUrl);
    this.playbackAudio = null;
    this.playbackUrl = null;
    this.playbackStop = null;
  }

  private handleConnectionError() {
    if (this.snapshot.connectionStatus !== "connected") return;
    this.teardown(false, "connection_lost");
    this.update({
      phase: "error",
      connectionStatus: "disconnected",
      error: "Live-Verbindung wurde unterbrochen.",
    });
  }

  private teardown(releaseClaim: boolean, reason: string) {
    this.operation += 1;
    liveV2DevelopmentLog("lifecycle", {
      event: "teardown",
      reason,
      operation: this.operation,
    });
    this.requestController?.abort();
    this.requestController = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playbackStop?.();
    this.finishPlaybackAudio();
    this.transport?.disconnect();
    this.transport = null;
    this.sourceStream?.getTracks().forEach((track) => track.stop());
    this.sourceStream = null;
    this.sourceAnalyser = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.turn = null;
    this.finalizing = false;
    if (releaseClaim && activeClient === this) activeClient = null;
  }

  private appendTurn(turn: LiveV2Turn) {
    const existing = this.snapshot.turns.findIndex((item) => item.turnId === turn.turnId);
    const turns = [...this.snapshot.turns];
    if (existing === -1) turns.push(turn);
    else turns[existing] = turn;
    this.update({ turns });
  }

  private patchTurn(turnId: string, patch: Partial<LiveV2Turn>) {
    this.update({
      turns: this.snapshot.turns.map((turn) =>
        turn.turnId === turnId ? { ...turn, ...patch } : turn
      ),
    });
  }

  private update(patch: Partial<LiveV2Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
