import type { TranslationLanguage } from "@/lib/translator/types";

const REALTIME_CALLS_ENDPOINT = "https://api.openai.com/v1/realtime/calls";
const SESSION_SETUP_TIMEOUT_MS = 12_000;
const FIRST_AUDIO_TIMEOUT_MS = 12_000;
const PLAYBACK_START_TIMEOUT_MS = 5_000;

const EXACT_TERRA_READ_INSTRUCTION = [
  "Speak exactly the supplied text and nothing else.",
  "Do not translate, paraphrase, summarize, correct, explain, introduce, or append anything.",
].join(" ");

type RealtimeSpeechCredential = {
  clientSecret: string;
  expiresAt: number;
  model: string;
  voice: string;
};

type RealtimeEvent = { type?: unknown };

export type RealtimeSpeechOutputTelemetry = {
  ttsTransport: "realtime_webrtc";
  ttsModel: string;
  ttsVoice: string;
  ttsSpeechProtocol: "realtime_webrtc";
  ttsRealtimeConnectionColdWarm: "cold" | "warm";
  ttsRealtimeSessionRequestStartedAt?: string;
  ttsRealtimeSessionReadyAt?: string;
  ttsRealtimePeerConnectionStartedAt?: string;
  ttsRealtimePeerConnectionReadyAt?: string;
  ttsRealtimeResponseCreateSentAt?: string;
  ttsRealtimeFirstAudioReceivedAt?: string;
  ttsRealtimeFirstAudioRenderableAt?: string;
  ttsRealtimePlaybackStartedAt?: string;
  ttsRealtimePlaybackCompletedAt?: string;
  ttsRealtimeFallbackUsed?: boolean;
  ttsRealtimeFallbackReason?: string | null;
  ttsRealtimeFallbackStartedAt?: string | null;
};

export type RealtimeSpeechOutputHandlers = {
  onTelemetry?: (telemetry: Partial<RealtimeSpeechOutputTelemetry>) => void;
  onFirstAudio?: (telemetry: RealtimeSpeechOutputTelemetry) => void;
  onPlaybackAttempt?: () => void;
  onPlaybackStarted?: () => void;
  onPlaybackCompleted?: () => void;
};

type OutputAudio = Pick<HTMLAudioElement,
  "autoplay" | "muted" | "onended" | "onerror" | "onplaying" | "pause" | "play" | "srcObject">;

type Dependencies = {
  fetcher?: typeof fetch;
  createPeerConnection?: () => RTCPeerConnection;
  createAudio?: () => OutputAudio;
  createMediaStream?: (tracks: MediaStreamTrack[]) => MediaStream;
  nowIso?: () => string;
};

function abortError() {
  return new DOMException("Realtime speech playback was stopped", "AbortError");
}

function timeoutError(stage: string) {
  return new Error(`realtime_speech_${stage}_timeout`);
}

function validCredential(value: unknown): value is RealtimeSpeechCredential {
  if (!value || typeof value !== "object") return false;
  const credential = value as Partial<RealtimeSpeechCredential>;
  return typeof credential.clientSecret === "string" &&
    typeof credential.expiresAt === "number" &&
    typeof credential.model === "string" &&
    typeof credential.voice === "string";
}

function waitForDataChannel(
  events: RTCDataChannel,
  signal: AbortSignal,
  timeoutMs: number,
) {
  if (events.readyState === "open") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      events.onopen = null;
      events.onerror = null;
      events.onclose = null;
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish(abortError());
    const timeout = setTimeout(() => finish(timeoutError("session_setup")), timeoutMs);
    events.onopen = () => finish();
    events.onerror = () => finish(new Error("realtime_speech_data_channel_error"));
    events.onclose = () => finish(new Error("realtime_speech_data_channel_closed"));
    signal.addEventListener("abort", cancel, { once: true });
  });
}

/**
 * Browser-only, output-only WebRTC transport. The model receives no
 * microphone input; the sole content sent on the event channel is the final
 * Terra translation supplied to `render`.
 */
export class ClassicRealtimeSpeechOutputClient {
  private readonly fetcher: typeof fetch;
  private readonly createPeerConnection: () => RTCPeerConnection;
  private readonly createAudio: () => OutputAudio;
  private readonly createMediaStream: (tracks: MediaStreamTrack[]) => MediaStream;
  private readonly nowIso: () => string;
  private peer: RTCPeerConnection | null = null;
  private events: RTCDataChannel | null = null;
  private audio: OutputAudio | null = null;
  private requestController: AbortController | null = null;

  constructor(dependencies: Dependencies = {}) {
    // WebKit requires the browser fetch receiver to remain Window.
    this.fetcher = dependencies.fetcher ?? globalThis.fetch.bind(globalThis);
    this.createPeerConnection = dependencies.createPeerConnection ?? (() => new RTCPeerConnection());
    this.createAudio = dependencies.createAudio ?? (() => new Audio());
    this.createMediaStream = dependencies.createMediaStream ?? ((tracks) => new MediaStream(tracks));
    this.nowIso = dependencies.nowIso ?? (() => new Date().toISOString());
  }

  async render(
    translatedText: string,
    _language: TranslationLanguage,
    signal: AbortSignal,
    handlers: RealtimeSpeechOutputHandlers = {},
  ) {
    this.stop();
    if (signal.aborted) throw abortError();
    const requestController = new AbortController();
    this.requestController = requestController;
    const transportSignal = requestController.signal;

    let firstAudioReceived = false;
    let responseCreateSent = false;
    let playbackObserved = false;
    let playbackStarted = false;
    let playbackCompleted = false;
    let firstAudioTimer: ReturnType<typeof setTimeout> | null = null;
    let playbackTimer: ReturnType<typeof setTimeout> | null = null;
    let sessionSetupTimer: ReturnType<typeof setTimeout> | null = null;
    let settle!: (error?: Error) => void;
    const done = new Promise<void>((resolve, reject) => {
      settle = (error?: Error) => error ? reject(error) : resolve();
    });
    // A media-track callback can fail while an unrelated WebRTC setup promise
    // is pending. Observe the terminal result immediately and race setup with it.
    void done.catch(() => undefined);
    const setupInterrupted = done.then(() => { throw abortError(); });
    void setupInterrupted.catch(() => undefined);
    const awaitSetup = <T>(operation: Promise<T>): Promise<T> =>
      Promise.race([operation, setupInterrupted]);
    const telemetryBase: RealtimeSpeechOutputTelemetry = {
      ttsTransport: "realtime_webrtc",
      ttsModel: "gpt-realtime-2.1-mini",
      ttsVoice: "alloy",
      ttsSpeechProtocol: "realtime_webrtc",
      ttsRealtimeConnectionColdWarm: "cold",
    };
    const emit = (telemetry: Partial<RealtimeSpeechOutputTelemetry>) => {
      handlers.onTelemetry?.(telemetry);
    };
    const cleanup = () => {
      if (firstAudioTimer) clearTimeout(firstAudioTimer);
      if (playbackTimer) clearTimeout(playbackTimer);
      if (sessionSetupTimer) clearTimeout(sessionSetupTimer);
      firstAudioTimer = null;
      playbackTimer = null;
      sessionSetupTimer = null;
      const audio = this.audio;
      this.audio = null;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.onplaying = null;
        audio.pause();
        audio.srcObject = null;
      }
      const events = this.events;
      this.events = null;
      if (events) {
        events.onmessage = null;
        events.close();
      }
      const peer = this.peer;
      this.peer = null;
      if (peer) {
        peer.ontrack = null;
        peer.onconnectionstatechange = null;
        peer.close();
      }
    };
    const fail = (error: Error) => {
      if (playbackCompleted) return;
      playbackCompleted = true;
      if (!transportSignal.aborted) requestController.abort();
      cleanup();
      settle(error);
    };
    const complete = () => {
      if (playbackCompleted) return;
      playbackCompleted = true;
      emit({ ttsRealtimePlaybackCompletedAt: this.nowIso() });
      handlers.onPlaybackCompleted?.();
      cleanup();
      settle();
    };
    const abort = () => {
      if (!transportSignal.aborted) requestController.abort();
      fail(abortError());
    };
    const armPlaybackTimer = () => {
      if (playbackTimer) clearTimeout(playbackTimer);
      playbackTimer = setTimeout(
        () => fail(new Error("realtime_playback_start_timeout")),
        PLAYBACK_START_TIMEOUT_MS,
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    sessionSetupTimer = setTimeout(() => {
      if (!transportSignal.aborted) requestController.abort();
      fail(timeoutError("session_setup"));
    }, SESSION_SETUP_TIMEOUT_MS);

    try {
      emit({ ttsRealtimeSessionRequestStartedAt: this.nowIso() });
      const credentialResponse = await awaitSetup(this.fetcher(
        "/api/translator/realtime-speech/session",
        { method: "POST", signal: transportSignal, cache: "no-store" },
      ));
      if (!credentialResponse.ok) throw new Error("realtime_speech_session_request_failed");
      const credentialJson = await awaitSetup(credentialResponse.json());
      if (!validCredential(credentialJson)) throw new Error("realtime_speech_session_invalid");
      const credential = credentialJson;
      emit({
        ttsModel: credential.model,
        ttsVoice: credential.voice,
        ttsRealtimeSessionReadyAt: this.nowIso(),
      });
      if (signal.aborted || transportSignal.aborted) throw abortError();

      emit({ ttsRealtimePeerConnectionStartedAt: this.nowIso() });
      const peer = this.createPeerConnection();
      this.peer = peer;
      peer.addTransceiver("audio", { direction: "recvonly" });
      const events = peer.createDataChannel("oai-events");
      this.events = events;
      peer.onconnectionstatechange = () => {
        if (peer !== this.peer || playbackCompleted || signal.aborted) return;
        if (peer.connectionState === "failed") fail(new Error("realtime_speech_peer_failed"));
      };
      const markPlaybackStarted = () => {
        playbackObserved = true;
        if (!responseCreateSent || playbackStarted || playbackCompleted || signal.aborted || peer !== this.peer) return;
        playbackStarted = true;
        if (playbackTimer) clearTimeout(playbackTimer);
        playbackTimer = null;
        emit({ ttsRealtimePlaybackStartedAt: this.nowIso() });
        handlers.onPlaybackStarted?.();
      };
      peer.ontrack = (event) => {
        if (peer !== this.peer || playbackCompleted || signal.aborted || firstAudioReceived) return;
        firstAudioReceived = true;
        if (firstAudioTimer) clearTimeout(firstAudioTimer);
        emit({ ttsRealtimeFirstAudioReceivedAt: this.nowIso() });
        const audio = this.createAudio();
        this.audio = audio;
        const stream = event.streams[0] ?? this.createMediaStream([event.track]);
        audio.autoplay = true;
        audio.muted = false;
        audio.onplaying = markPlaybackStarted;
        audio.onended = () => {
          if (playbackStarted) complete();
          else fail(new Error("realtime_speech_audio_ended_before_playback"));
        };
        audio.onerror = () => fail(new Error("realtime_speech_audio_error"));
        audio.srcObject = stream;
        emit({ ttsRealtimeFirstAudioRenderableAt: this.nowIso() });
        handlers.onFirstAudio?.({ ...telemetryBase, ttsModel: credential.model, ttsVoice: credential.voice });
        handlers.onPlaybackAttempt?.();
        armPlaybackTimer();
        try {
          void audio.play().then(markPlaybackStarted, (error) => {
            if (!playbackStarted) {
              fail(error instanceof Error ? error : new Error("realtime_speech_playback_failed"));
            }
          });
        } catch (error) {
          if (!playbackStarted) {
            fail(error instanceof Error ? error : new Error("realtime_speech_playback_failed"));
          }
        }
      };

      const offer = await awaitSetup(peer.createOffer());
      if (signal.aborted || transportSignal.aborted) throw abortError();
      await awaitSetup(peer.setLocalDescription(offer));
      if (!offer.sdp) throw new Error("realtime_speech_offer_missing_sdp");
      const answer = await awaitSetup(this.fetcher(REALTIME_CALLS_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
        signal: transportSignal,
      }));
      const answerSdp = await awaitSetup(answer.text());
      if (!answer.ok || !answerSdp) throw new Error("realtime_speech_sdp_failed");
      await awaitSetup(peer.setRemoteDescription({ type: "answer", sdp: answerSdp }));
      await awaitSetup(waitForDataChannel(events, transportSignal, SESSION_SETUP_TIMEOUT_MS));
      if (sessionSetupTimer) clearTimeout(sessionSetupTimer);
      sessionSetupTimer = null;
      if (signal.aborted || transportSignal.aborted) throw abortError();
      emit({ ttsRealtimePeerConnectionReadyAt: this.nowIso() });
      events.onmessage = (message) => {
        if (peer !== this.peer || playbackCompleted || signal.aborted || transportSignal.aborted || typeof message.data !== "string") return;
        let event: RealtimeEvent;
        try {
          event = JSON.parse(message.data) as RealtimeEvent;
        } catch {
          return;
        }
        if (event.type === "error") fail(new Error("realtime_speech_response_error"));
      };
      events.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: translatedText }],
        },
      }));
      events.send(JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],
          instructions: EXACT_TERRA_READ_INSTRUCTION,
        },
      }));
      responseCreateSent = true;
      emit({ ttsRealtimeResponseCreateSentAt: this.nowIso() });
      if (playbackObserved) markPlaybackStarted();
      if (firstAudioReceived && !playbackStarted) armPlaybackTimer();
      if (!firstAudioReceived) {
        firstAudioTimer = setTimeout(() => fail(timeoutError("first_audio")), FIRST_AUDIO_TIMEOUT_MS);
      }
      await done;
    } catch (error) {
      if (!playbackCompleted) {
        const normalized = signal.aborted ? abortError() : error instanceof Error
          ? error
          : new Error("realtime_speech_unknown_error");
        fail(normalized);
      }
      await done;
    } finally {
      signal.removeEventListener("abort", abort);
      if (this.requestController === requestController) {
        this.requestController = null;
      }
    }
  }

  stop() {
    this.requestController?.abort();
    this.requestController = null;
    const audio = this.audio;
    this.audio = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
      audio.pause();
      audio.srcObject = null;
    }
    const events = this.events;
    this.events = null;
    if (events) {
      events.onmessage = null;
      events.close();
    }
    const peer = this.peer;
    this.peer = null;
    if (peer) {
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.close();
    }
  }
}

export { EXACT_TERRA_READ_INSTRUCTION };
