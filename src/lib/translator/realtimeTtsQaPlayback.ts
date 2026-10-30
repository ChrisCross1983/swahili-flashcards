/** One response per QA session. Media events are never inferred from RTP silence. */
export class RealtimeTtsQaPlayback {
  readonly data = {
    remotePlaybackReadyAt: null as string | null,
    remoteTrackActiveAfterRequestAt: null as string | null,
    firstResponseMediaEventAt: null as string | null,
    firstResponseMediaEvent: null as string | null,
    responsePlayingAt: null as string | null,
    outputAudioBufferStartedAt: null as string | null,
    audibleStartMeasurement: "not_observable" as const,
    requestStartAt: null as string | null, responseStartAt: null as string | null,
    responseId: null as string | null, firstAudioReceivedAt: null as string | null,
    firstAudiblePlaybackAt: null as string | null, completeAudioReceivedAt: null as string | null,
    playbackEndedAt: null as string | null, serverOutputBufferStoppedAt: null as string | null,
    requestToFirstAudioMs: null as number | null, requestToPlayingMs: null as number | null,
    requestToCompleteAudioMs: null as number | null, totalLatencyMs: null as number | null,
    outputTranscript: "", error: null as string | null, aborted: false,
    debug: [] as Array<Record<string, unknown>>,
  };
  private disposed = false;
  private requestedAt: number | null = null;
  private stream: MediaStream | null = null;
  private listeners: Array<() => void> = [];
  private audioActive = false;
  private remotePlaying = false;
  private remotePlayResolved = false;
  private readiness = new EventTarget();
  private checkReady() {
    if (this.disposed || !this.stream || !this.remotePlaying || !this.remotePlayResolved || this.audio.paused) return;
    this.data.remotePlaybackReadyAt ??= this.iso();
    this.readiness.dispatchEvent(new Event("ready"));
    this.changed();
  }
  waitUntilReady(signal: AbortSignal): Promise<void> {
    if (signal.aborted || this.disposed) return Promise.reject(new Error("Abgebrochen"));
    if (this.data.remotePlaybackReadyAt && !this.audio.paused) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.readiness.removeEventListener("ready", ready); this.readiness.removeEventListener("disposed", abort); signal.removeEventListener("abort", abort); };
      const ready = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(new Error("Abgebrochen")); };
      const timer = setTimeout(() => { cleanup(); reject(new Error("Remote-Playback nicht bereit; Test erneut starten und Audio freigeben.")); }, 20000);
      this.readiness.addEventListener("ready", ready);
      this.readiness.addEventListener("disposed", abort);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  private responseMediaEvent(name: string) {
    if (this.requestedAt === null || !this.stream) return;
    this.data.firstResponseMediaEventAt ??= this.iso();
    this.data.firstResponseMediaEvent ??= name;
  }
  constructor(private audio: HTMLAudioElement, readonly runId: string,
    private changed: () => void, private status: (value: string) => void,
    private now = () => Date.now()) {
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");
    audio.muted = false;
    audio.volume = 1;
    for (const name of ["playing", "waiting", "stalled", "error", "ended", "pause"]) {
      this.listen(audio, name, () => {
        this.log(name);
        if (name === "playing" && this.stream && this.audio.srcObject === this.stream) {
          this.remotePlaying = true; this.checkReady(); this.responseMediaEvent("playing");
        }
        if (name === "playing" && this.requestedAt !== null && this.data.responseId && this.audioActive) {
          this.data.responsePlayingAt ??= this.iso();
          this.data.requestToPlayingMs ??= this.now() - this.requestedAt;
          // A browser event cannot establish physical audibility.
          this.status("Wiedergabe läuft (Browser-playing)");
        }
        if (name === "ended" && this.data.firstAudioReceivedAt) this.data.playbackEndedAt = this.iso();
        if (name === "error") {
          this.data.error = `Audiofehler ${audio.error?.code}: ${audio.error?.message ?? "unbekannt"}`;
          this.status(this.data.error);
        }
        this.changed();
      });
    }
  }
  private iso() { return new Date(this.now()).toISOString(); }
  private listen(target: EventTarget, name: string, fn: () => void) {
    target.addEventListener(name, fn);
    this.listeners.push(() => target.removeEventListener(name, fn));
  }
  private log(event: string, extra: Record<string, unknown> = {}) {
    if (this.disposed) return;
    this.data.debug.push({ at: this.iso(), event, srcObjectPresent: !!this.audio.srcObject,
      streamId: this.stream?.id, tracks: this.stream?.getAudioTracks().map(t => ({ id: t.id, readyState: t.readyState, enabled: t.enabled, muted: t.muted })),
      paused: this.audio.paused, muted: this.audio.muted, volume: this.audio.volume,
      mediaErrorCode: this.audio.error?.code ?? null, mediaErrorMessage: this.audio.error?.message ?? null, ...extra });
    this.changed();
  }
  /** Called in the tap stack; a tiny silent WAV only unlocks the element, not model playback. */
  prime() {
    const bytes = new Uint8Array(44 + 800);
    const view = new DataView(bytes.buffer);
    const word = (at: number, value: string) => [...value].forEach((c, i) => { bytes[at + i] = c.charCodeAt(0); });
    word(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); word(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 8000, true);
    view.setUint16(32, 1, true); view.setUint16(34, 8, true); word(36, "data"); view.setUint32(40, 800, true);
    bytes.fill(128, 44);
    this.audio.src = `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
    this.audio.loop = true;
    void this.play("prime");
  }
  bind(event: RTCTrackEvent) {
    if (this.disposed || event.track.kind !== "audio") return;
    this.stream = event.streams[0] ?? new MediaStream([event.track]);
    event.track.enabled = true;
    this.audio.loop = false;
    this.audio.srcObject = this.stream;
    this.log("ontrack", { trackId: event.track.id });
    for (const name of ["mute", "unmute", "ended"]) this.listen(event.track, name, () => {
      if (name === "unmute" && this.requestedAt !== null) {
        this.data.remoteTrackActiveAfterRequestAt ??= this.iso();
        this.responseMediaEvent("track:unmute");
      }
      this.log(`track:${name}`);
    });
    void this.play("remote-track");
  }
  async play(reason = "manual") {
    if (this.disposed) return;
    if (reason === "manual" && !this.stream) { this.status("Noch kein Remote-Audiotrack empfangen"); this.log("manual-no-track"); return; }
    this.audio.muted = false; this.audio.volume = 1;
    this.log("play-attempt", { reason });
    try {
      await this.audio.play();
      if (this.disposed) return;
      if (reason !== "prime" && this.stream && this.audio.srcObject === this.stream) {
        this.remotePlayResolved = true; this.checkReady();
      }
      this.log("play-success", { reason });
    } catch (error) {
      if (this.disposed) return;
      const name = error instanceof Error ? error.name : "UnknownError";
      const message = error instanceof Error ? error.message : String(error);
      this.log("play-failure", { reason, name, message });
      if (reason !== "prime") this.status(name === "NotAllowedError"
        ? "Wiedergabe von iOS blockiert – bitte Audio abspielen"
        : `Wiedergabefehler: ${name}: ${message}`);
    }
  }
  request() {
    this.requestedAt = this.now(); this.data.requestStartAt = this.iso(); this.log("response-request-sent");
  }
  event(event: Record<string, unknown>) {
    if (this.disposed) return;
    if (event.type === "error") {
      this.data.error = JSON.stringify(event.error); this.log("session-error", { error: event.error });
      this.status(`Realtime-Fehler: ${this.data.error}`); return;
    }
    if (this.requestedAt === null) return;
    const response = event.response as { id?: string; status?: string; metadata?: { qaRunId?: string } } | undefined;
    if (event.type === "response.created" && response?.metadata?.qaRunId === this.runId && response.id) {
      this.data.responseId = response.id; this.data.responseStartAt = this.iso(); this.changed(); return;
    }
    if (!this.data.responseId || (event.response_id ?? response?.id) !== this.data.responseId) return;
    this.log(String(event.type));
    if (event.type === "output_audio_buffer.started") {
      this.audioActive = true;
      this.data.outputAudioBufferStartedAt ??= this.iso();
      this.data.firstAudioReceivedAt ??= this.iso();
      this.data.requestToFirstAudioMs ??= this.now() - this.requestedAt;
      this.status("Audio empfangen (Server-Output gestartet)");
      // Never interrupt a live track just to manufacture a playing timestamp.
      if (this.audio.paused) void this.play("output-start");
    }
    if (event.type === "response.output_audio_transcript.delta" && typeof event.delta === "string") this.data.outputTranscript += event.delta;
    if (event.type === "response.output_audio_transcript.done" && typeof event.transcript === "string") this.data.outputTranscript = event.transcript;
    if (event.type === "response.output_audio.done" || (event.type === "response.done" && response?.status === "completed")) {
      this.data.completeAudioReceivedAt ??= this.iso();
      this.data.requestToCompleteAudioMs ??= this.now() - this.requestedAt;
    }
    if (event.type === "response.done" && response?.status !== "completed") {
      this.data.error = `Response: ${response?.status}`; this.status(this.data.error);
    }
    if (event.type === "output_audio_buffer.stopped") {
      this.data.serverOutputBufferStoppedAt = this.iso();
      this.audioActive = false;
      this.status("Server-Audio beendet; kein Replay im Live-Stream. Für Wiederholung neu starten.");
    }
    this.changed();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.readiness.dispatchEvent(new Event("disposed"));
    this.listeners.forEach(remove => remove()); this.listeners = [];
    this.stream?.getTracks().forEach(track => track.stop());
    this.audio.pause(); this.audio.srcObject = null; this.audio.loop = false;
    this.audio.removeAttribute("src"); this.audio.load();
  }
}
