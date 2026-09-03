export const AUDIO_MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

export type AudioRecorderStatus =
  | "idle"
  | "starting"
  | "recording"
  | "stopping"
  | "error";

export type AudioRecorderSnapshot = {
  status: AudioRecorderStatus;
  error: string | null;
  audioBlob: Blob | null;
  mimeType: string | null;
};

export const MICROPHONE_ACQUISITION_TIMEOUT_MS = 12_000;
export const MEDIA_RECORDER_TIMESLICE_MS = 1_000;

export type MicrophoneAcquisitionOutcome =
  | "success"
  | "timeout"
  | "permission_denied"
  | "device_unavailable"
  | "aborted"
  | "stale_result"
  | "unknown_failure";

export type MicrophoneAcquisitionState =
  | "idle"
  | "requesting_permission_or_device"
  | "acquired"
  | "timed_out"
  | "permission_denied"
  | "device_unavailable"
  | "aborted"
  | "stale_result";

export type AudioRecorderCaptureDiagnostics = {
  microphoneAcquisitionAttemptId: string | null;
  microphoneAcquisitionStartedAt: string | null;
  microphoneAcquisitionCompletedAt: string | null;
  microphoneAcquisitionMs: number | null;
  microphoneAcquisitionOutcome: MicrophoneAcquisitionOutcome | null;
  freshStreamRequested: boolean;
  streamReused: boolean;
  captureGeneration: number | null;
  trackReadyStateAtAcquisition: MediaStreamTrackState | null;
  trackEnabledAtAcquisition: boolean | null;
  trackMutedAtAcquisition: boolean | null;
  mediaRecorderChunkCount: number;
  mediaRecorderTotalChunkBytes: number;
};

type AudioRecorderDependencies = {
  getUserMedia?: () => Promise<MediaStream>;
  createRecorder?: (stream: MediaStream, mimeType: string) => MediaRecorder;
  isTypeSupported?: (mimeType: string) => boolean;
  onChange?: (snapshot: AudioRecorderSnapshot) => void;
  shouldReuseStream?: (stream: MediaStream) => boolean;
  acquisitionTimeoutMs?: number;
  recorderTimesliceMs?: number;
  now?: () => number;
  wallNow?: () => number;
  randomId?: () => string;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

const ERROR_MESSAGES = {
  permission: "Mikrofonzugriff ist nicht erlaubt. Bitte erlaube den Mikrofonzugriff in den Browser-Einstellungen.",
  noDevice: "Es wurde kein verfügbares Mikrofon gefunden.",
  unsupported: "Die Audioaufnahme wird von diesem Browser nicht unterstützt.",
  unavailable: "Das Mikrofon ist gerade nicht verfügbar. Schließe andere Audio-Aufnahmen und versuche es erneut.",
  timeout: "Das Mikrofon konnte nicht geöffnet werden. Bitte versuche es erneut.",
  noAudio: "Es wurde keine Sprache aufgenommen. Bitte versuche es noch einmal.",
  start: "Die Aufnahme konnte nicht gestartet werden.",
  stop: "Die Aufnahme konnte nicht beendet werden.",
} as const;

export function selectSupportedAudioMimeType(
  isTypeSupported?: (mimeType: string) => boolean,
) {
  if (!isTypeSupported) return "";
  for (const mimeType of AUDIO_MIME_TYPE_CANDIDATES) {
    try {
      if (isTypeSupported(mimeType)) return mimeType;
    } catch {
      // Let MediaRecorder select its own default when capability checks fail.
      return "";
    }
  }
  return "";
}

function errorName(error: unknown) {
  return typeof error === "object" && error && "name" in error
    ? String(error.name)
    : "";
}

export function getAudioRecorderErrorMessage(error: unknown) {
  if (error instanceof AudioRecorderError) return error.message;

  switch (errorName(error)) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return ERROR_MESSAGES.permission;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return ERROR_MESSAGES.noDevice;
    case "NotReadableError":
    case "TrackStartError":
      return ERROR_MESSAGES.unavailable;
    default:
      return ERROR_MESSAGES.start;
  }
}

export class AudioRecorderError extends Error {
  constructor(
    message: string,
    readonly code: string = "recording_failed",
  ) {
    super(message);
    this.name = "AudioRecorderError";
  }
}

export class AudioRecorderController {
  private readonly dependencies: AudioRecorderDependencies;
  private snapshot: AudioRecorderSnapshot = {
    status: "idle",
    error: null,
    audioBlob: null,
    mimeType: null,
  };
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private acquirePromise: Promise<MediaStream> | null = null;
  private preparePromise: Promise<MediaStream> | null = null;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<Blob> | null = null;
  private resolveStop: ((blob: Blob) => void) | null = null;
  private rejectStop: ((error: Error) => void) | null = null;
  private disposed = false;
  private acquisitionGeneration = 0;
  private activeAcquisitionGeneration = 0;
  private cancelAcquisition: (() => void) | null = null;
  private captureGeneration = 0;
  private streamPoisoned = false;
  private acquisitionState: MicrophoneAcquisitionState = "idle";
  private chunkCount = 0;
  private chunkBytes = 0;
  private captureDiagnostics: AudioRecorderCaptureDiagnostics = {
    microphoneAcquisitionAttemptId: null,
    microphoneAcquisitionStartedAt: null,
    microphoneAcquisitionCompletedAt: null,
    microphoneAcquisitionMs: null,
    microphoneAcquisitionOutcome: null,
    freshStreamRequested: false,
    streamReused: false,
    captureGeneration: null,
    trackReadyStateAtAcquisition: null,
    trackEnabledAtAcquisition: null,
    trackMutedAtAcquisition: null,
    mediaRecorderChunkCount: 0,
    mediaRecorderTotalChunkBytes: 0,
  };

  constructor(dependencies: AudioRecorderDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot() {
    return this.snapshot;
  }

  getMediaStream() {
    return this.stream;
  }

  getCaptureDiagnostics() {
    return { ...this.captureDiagnostics };
  }

  getMicrophoneAcquisitionState() {
    return this.acquisitionState;
  }

  hasPendingAcquisition() {
    return this.acquirePromise !== null;
  }

  clearError() {
    if (!this.snapshot.error) return;
    this.update({ status: "idle", error: null });
  }

  acquireMicrophone() {
    if (
      this.stream &&
      !this.streamPoisoned &&
      this.isStreamUsable(this.stream) &&
      (this.dependencies.shouldReuseStream?.(this.stream) ?? true)
    ) {
      const started = this.now();
      this.setTracksEnabled(this.stream, true);
      this.acquisitionState = "acquired";
      this.captureDiagnostics = {
        ...this.captureDiagnostics,
        microphoneAcquisitionAttemptId: this.id(),
        microphoneAcquisitionStartedAt: this.isoNow(),
        microphoneAcquisitionCompletedAt: this.isoNow(),
        microphoneAcquisitionMs: Math.max(0, Math.round(this.now() - started)),
        microphoneAcquisitionOutcome: "success",
        freshStreamRequested: false,
        streamReused: true,
        captureGeneration: this.captureGeneration,
        ...this.trackDiagnostics(this.stream),
      };
      return Promise.resolve(this.stream);
    }
    if (this.acquirePromise) return this.acquirePromise;
    if (this.disposed || !this.dependencies.getUserMedia) {
      const error = new AudioRecorderError(
        this.dependencies.getUserMedia
          ? ERROR_MESSAGES.start
          : ERROR_MESSAGES.noDevice,
      );
      this.update({ status: "error", error: error.message });
      return Promise.reject(error);
    }

    this.update({
      status: "starting",
      error: null,
      audioBlob: null,
      mimeType: null,
    });
    const generation = ++this.acquisitionGeneration;
    this.activeAcquisitionGeneration = generation;
    this.acquisitionState = "requesting_permission_or_device";
    const promise = this.acquire(generation);
    this.acquirePromise = promise;
    void promise.then(
      () => {
        if (this.acquirePromise === promise) this.acquirePromise = null;
      },
      () => {
        if (this.acquirePromise === promise) this.acquirePromise = null;
      },
    );
    return promise;
  }

  startRecording() {
    if (this.startPromise) return this.startPromise;
    if (this.snapshot.status === "recording") return Promise.resolve();
    if (this.snapshot.status === "stopping") {
      return Promise.reject(new AudioRecorderError(ERROR_MESSAGES.start));
    }

    const promise = this.prepareRecording().then(() =>
      this.startPreparedRecording(),
    );
    this.startPromise = promise;
    void promise.then(
      () => {
        if (this.startPromise === promise) this.startPromise = null;
      },
      () => {
        if (this.startPromise === promise) this.startPromise = null;
      },
    );
    return promise;
  }

  prepareRecording() {
    if (this.preparePromise) return this.preparePromise;
    if (
      this.stream &&
      this.recorder &&
      (this.snapshot.status === "starting" ||
        this.snapshot.status === "recording")
    ) {
      return Promise.resolve(this.stream);
    }
    if (this.snapshot.status === "stopping") {
      return Promise.reject(new AudioRecorderError(ERROR_MESSAGES.start));
    }

    const promise = this.prepare();
    this.preparePromise = promise;
    void promise.then(
      () => {
        if (this.preparePromise === promise) this.preparePromise = null;
      },
      () => {
        if (this.preparePromise === promise) this.preparePromise = null;
      },
    );
    return promise;
  }

  async startPreparedRecording() {
    if (this.snapshot.status === "recording") return;
    if (this.preparePromise) await this.preparePromise;
    if (
      this.disposed ||
      !this.stream ||
      !this.recorder ||
      this.snapshot.status !== "starting"
    ) {
      throw new AudioRecorderError(ERROR_MESSAGES.start);
    }

    try {
      this.recorder.start(
        this.dependencies.recorderTimesliceMs ?? MEDIA_RECORDER_TIMESLICE_MS,
      );
      this.update({
        status: "recording",
        error: null,
        audioBlob: null,
        mimeType: this.recorder.mimeType || this.snapshot.mimeType,
      });
    } catch {
      this.stopTracks(this.stream);
      this.stream = null;
      this.streamPoisoned = true;
      this.releaseRecorder();
      this.update({ status: "idle", error: ERROR_MESSAGES.start });
      throw new AudioRecorderError(ERROR_MESSAGES.start);
    }
  }

  suspendMicrophone() {
    if (this.snapshot.status === "recording") return false;
    if (this.stream && !(this.dependencies.shouldReuseStream?.(this.stream) ?? true)) {
      this.stopTracks(this.stream);
      this.stream = null;
      return true;
    }
    this.setTracksEnabled(this.stream, false);
    return Boolean(this.stream);
  }

  releaseMicrophone() {
    if (
      this.snapshot.status === "recording" ||
      this.snapshot.status === "stopping"
    ) {
      return false;
    }
    this.stopTracks(this.stream);
    this.stream = null;
    this.streamPoisoned = false;
    this.acquisitionState = "idle";
    return true;
  }

  poisonCurrentStream() {
    this.streamPoisoned = true;
    this.stopTracks(this.stream);
    this.stream = null;
    this.acquisitionState = "idle";
    return true;
  }

  abortPendingAcquisition() {
    if (!this.acquirePromise) return false;
    this.activeAcquisitionGeneration = 0;
    this.cancelAcquisition?.();
    this.cancelAcquisition = null;
    this.acquisitionState = "aborted";
    return true;
  }

  private async acquire(generation: number) {
    let stream: MediaStream | null = null;
    const startedMono = this.now();
    const attemptId = this.id();
    const startedAt = this.isoNow();
    this.stopTracks(this.stream);
    this.stream = null;
    this.streamPoisoned = false;
    this.captureDiagnostics = {
      ...this.captureDiagnostics,
      microphoneAcquisitionAttemptId: attemptId,
      microphoneAcquisitionStartedAt: startedAt,
      microphoneAcquisitionCompletedAt: null,
      microphoneAcquisitionMs: null,
      microphoneAcquisitionOutcome: null,
      freshStreamRequested: true,
      streamReused: false,
      captureGeneration: null,
      trackReadyStateAtAcquisition: null,
      trackEnabledAtAcquisition: null,
      trackMutedAtAcquisition: null,
    };
    let rawPromise: Promise<MediaStream | null>;
    try {
      rawPromise = Promise.resolve(
        this.dependencies.getUserMedia?.() ?? null,
      );
    } catch (error) {
      rawPromise = Promise.reject(error);
    }
    void rawPromise.then((lateStream) => {
      if (
        lateStream &&
        (this.disposed || this.activeAcquisitionGeneration !== generation)
      ) {
        this.stopTracks(lateStream);
      }
    }, () => undefined);
    let rejectWatchdog!: (error: AudioRecorderError) => void;
    const watchdog = new Promise<never>((_resolve, reject) => {
      rejectWatchdog = reject;
    });
    this.cancelAcquisition = () => rejectWatchdog(
      new AudioRecorderError(ERROR_MESSAGES.start, "microphone_acquisition_aborted"),
    );
    const setTimer = this.dependencies.setTimer ?? setTimeout;
    const clearTimer = this.dependencies.clearTimer ?? clearTimeout;
    const timer = setTimer(() => {
      if (this.activeAcquisitionGeneration !== generation) return;
      this.activeAcquisitionGeneration = 0;
      rejectWatchdog(new AudioRecorderError(
        ERROR_MESSAGES.timeout,
        "microphone_acquisition_timeout",
      ));
    }, this.dependencies.acquisitionTimeoutMs ?? MICROPHONE_ACQUISITION_TIMEOUT_MS);
    try {
      stream = await Promise.race([rawPromise, watchdog]);
      if (!stream) throw new AudioRecorderError(ERROR_MESSAGES.noDevice);
      if (this.disposed || this.activeAcquisitionGeneration !== generation) {
        this.stopTracks(stream);
        stream = null;
        throw new AudioRecorderError(ERROR_MESSAGES.start, "stale_microphone_acquisition");
      }
      this.activeAcquisitionGeneration = 0;
      this.cancelAcquisition = null;
      this.stream = stream;
      this.acquisitionState = "acquired";
      this.setTracksEnabled(stream, true);
      this.captureGeneration += 1;
      this.captureDiagnostics = {
        ...this.captureDiagnostics,
        microphoneAcquisitionCompletedAt: this.isoNow(),
        microphoneAcquisitionMs: Math.max(0, Math.round(this.now() - startedMono)),
        microphoneAcquisitionOutcome: "success",
        captureGeneration: this.captureGeneration,
        ...this.trackDiagnostics(stream),
      };
      return stream;
    } catch (error) {
      if (stream) this.stopTracks(stream);
      const message = getAudioRecorderErrorMessage(error);
      const code = error instanceof AudioRecorderError
        ? error.code
        : this.acquisitionErrorCode(error);
      const outcome = this.acquisitionOutcome(error);
      this.acquisitionState = outcome === "timeout"
        ? "timed_out"
        : outcome === "success"
          ? "acquired"
        : outcome === "unknown_failure"
          ? "device_unavailable"
          : outcome;
      if (this.captureDiagnostics.microphoneAcquisitionAttemptId === attemptId) {
        this.captureDiagnostics = {
          ...this.captureDiagnostics,
          microphoneAcquisitionCompletedAt: this.isoNow(),
          microphoneAcquisitionMs: Math.max(0, Math.round(this.now() - startedMono)),
          microphoneAcquisitionOutcome: outcome,
        };
      }
      // Acquisition failures are recoverable. Keep the message, but never leave
      // the recorder in a state that blocks the next explicit user attempt.
      this.update({ status: "idle", error: message });
      throw new AudioRecorderError(message, code);
    } finally {
      clearTimer(timer);
      if (this.activeAcquisitionGeneration === generation) {
        this.activeAcquisitionGeneration = 0;
      }
      this.cancelAcquisition = null;
    }
  }

  private async prepare() {
    if (this.disposed) throw new AudioRecorderError(ERROR_MESSAGES.start);
    if (!this.dependencies.createRecorder) {
      const error = new AudioRecorderError(ERROR_MESSAGES.unsupported);
      this.update({ status: "error", error: error.message });
      throw error;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await this.acquireMicrophone();
      if (this.disposed) {
        throw new AudioRecorderError(ERROR_MESSAGES.start);
      }

      const selectedMimeType = selectSupportedAudioMimeType(
        this.dependencies.isTypeSupported,
      );
      let recorder: MediaRecorder;
      try {
        recorder = this.dependencies.createRecorder(stream, selectedMimeType);
      } catch (error) {
        if (!selectedMimeType) throw error;
        recorder = this.dependencies.createRecorder(stream, "");
      }

      this.stream = stream;
      this.recorder = recorder;
      this.chunks = [];
      this.chunkCount = 0;
      this.chunkBytes = 0;
      recorder.addEventListener("dataavailable", this.handleDataAvailable);
      recorder.addEventListener("stop", this.handleStop);
      recorder.addEventListener("error", this.handleRecorderError);

      this.update({
        status: "starting",
        error: null,
        audioBlob: null,
        mimeType: recorder.mimeType || selectedMimeType || null,
      });
      return stream;
    } catch (error) {
      if (stream) {
        this.stopTracks(stream);
        if (this.stream === stream) this.stream = null;
        this.streamPoisoned = true;
      }
      this.releaseRecorder();
      const message = getAudioRecorderErrorMessage(error);
      const recoverableAcquisitionError = error instanceof AudioRecorderError &&
        (error.code.startsWith("microphone_") || [
          "stale_microphone_acquisition",
          "unknown_failure",
          "recording_failed",
        ].includes(error.code));
      this.update({
        status: recoverableAcquisitionError ? "idle" : "error",
        error: message,
      });
      throw error instanceof AudioRecorderError
        ? error
        : new AudioRecorderError(message);
    }
  }

  stopRecording() {
    if (this.stopPromise) return this.stopPromise;
    if (!this.recorder || this.snapshot.status !== "recording") {
      return Promise.reject(new AudioRecorderError(ERROR_MESSAGES.stop));
    }

    const promise = new Promise<Blob>((resolve, reject) => {
      this.resolveStop = resolve;
      this.rejectStop = reject;
    });
    this.stopPromise = promise;
    this.update({ status: "stopping", error: null });

    try {
      this.recorder.stop();
    } catch {
      this.failStop(new AudioRecorderError(ERROR_MESSAGES.stop));
    }

    return promise;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Tracks are stopped below even if the recorder cannot be stopped.
      }
    }

    this.stopTracks(this.stream);
    this.activeAcquisitionGeneration = 0;
    this.acquisitionGeneration += 1;
    this.cancelAcquisition?.();
    this.cancelAcquisition = null;
    this.removeRecorderListeners();
    this.rejectStop?.(new AudioRecorderError(ERROR_MESSAGES.stop));
    this.clearStopPromise();
    this.recorder = null;
    this.stream = null;
    this.acquisitionState = "idle";
    this.chunks = [];
    this.acquirePromise = null;
    this.preparePromise = null;
    this.startPromise = null;
  }

  private handleDataAvailable = (event: BlobEvent) => {
    if (event.data?.size > 0) {
      this.chunks.push(event.data);
      this.chunkCount += 1;
      this.chunkBytes += event.data.size;
      this.captureDiagnostics = {
        ...this.captureDiagnostics,
        mediaRecorderChunkCount: this.chunkCount,
        mediaRecorderTotalChunkBytes: this.chunkBytes,
      };
    }
  };

  private handleStop = () => {
    const recorder = this.recorder;
    const mimeType =
      recorder?.mimeType ||
      this.chunks.find((chunk) => Boolean(chunk.type))?.type ||
      this.snapshot.mimeType ||
      "";
    const blob = new Blob(this.chunks, { type: mimeType });

    this.removeRecorderListeners();
    this.recorder = null;
    this.chunks = [];

    if (!this.disposed) {
      this.update({
        status: "idle",
        error: null,
        audioBlob: blob,
        mimeType: blob.type || null,
      });
    }
    this.resolveStop?.(blob);
    this.clearStopPromise();
  };

  private handleRecorderError = (event: Event) => {
    const recorderError = (event as Event & { error?: unknown }).error;
    const message = getAudioRecorderErrorMessage(recorderError);
    this.failStop(new AudioRecorderError(message));
  };

  private failStop(error: AudioRecorderError) {
    this.removeRecorderListeners();
    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch {
        // Track cleanup below still releases the microphone.
      }
    }
    this.stopTracks(this.stream);
    this.stream = null;
    this.streamPoisoned = true;
    this.releaseRecorder();
    this.update({ status: "idle", error: error.message });
    this.rejectStop?.(error);
    this.clearStopPromise();
  }

  private releaseRecorder() {
    this.removeRecorderListeners();
    this.recorder = null;
    this.chunks = [];
  }

  private removeRecorderListeners() {
    this.recorder?.removeEventListener("dataavailable", this.handleDataAvailable);
    this.recorder?.removeEventListener("stop", this.handleStop);
    this.recorder?.removeEventListener("error", this.handleRecorderError);
  }

  private stopTracks(stream: MediaStream | null) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  private setTracksEnabled(stream: MediaStream | null, enabled: boolean) {
    stream?.getTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  private isStreamUsable(stream: MediaStream) {
    const tracks = stream.getAudioTracks?.() ?? stream.getTracks();
    return (
      tracks.length > 0 &&
      tracks.every((track) => track.readyState === undefined || track.readyState !== "ended")
    );
  }

  private trackDiagnostics(stream: MediaStream) {
    const track = (stream.getAudioTracks?.() ?? stream.getTracks())[0];
    return {
      trackReadyStateAtAcquisition: track?.readyState ?? null,
      trackEnabledAtAcquisition: typeof track?.enabled === "boolean" ? track.enabled : null,
      trackMutedAtAcquisition: typeof track?.muted === "boolean" ? track.muted : null,
    };
  }

  private acquisitionOutcome(error: unknown): MicrophoneAcquisitionOutcome {
    if (error instanceof AudioRecorderError) {
      if (error.code === "microphone_acquisition_timeout") return "timeout";
      if (error.code === "microphone_acquisition_aborted") return "aborted";
      if (error.code === "stale_microphone_acquisition") return "stale_result";
    }
    switch (errorName(error)) {
      case "NotAllowedError":
      case "PermissionDeniedError":
      case "SecurityError": return "permission_denied";
      case "NotFoundError":
      case "DevicesNotFoundError":
      case "NotReadableError":
      case "TrackStartError": return "device_unavailable";
      default: return "unknown_failure";
    }
  }

  private acquisitionErrorCode(error: unknown) {
    switch (errorName(error)) {
      case "NotAllowedError":
      case "PermissionDeniedError":
      case "SecurityError": return "microphone_permission_denied";
      case "NotFoundError":
      case "DevicesNotFoundError":
      case "NotReadableError":
      case "TrackStartError": return "microphone_device_unavailable";
      default: return "unknown_failure";
    }
  }

  private now() {
    return (this.dependencies.now ?? (() => performance.now()))();
  }

  private isoNow() {
    return new Date((this.dependencies.wallNow ?? Date.now)()).toISOString();
  }

  private id() {
    return this.dependencies.randomId?.() ??
      globalThis.crypto?.randomUUID?.() ??
      `mic-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private clearStopPromise() {
    this.stopPromise = null;
    this.resolveStop = null;
    this.rejectStop = null;
  }

  private update(patch: Partial<AudioRecorderSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.dependencies.onChange?.(this.snapshot);
  }
}
