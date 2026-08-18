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

type AudioRecorderDependencies = {
  getUserMedia?: () => Promise<MediaStream>;
  createRecorder?: (stream: MediaStream, mimeType: string) => MediaRecorder;
  isTypeSupported?: (mimeType: string) => boolean;
  onChange?: (snapshot: AudioRecorderSnapshot) => void;
};

const ERROR_MESSAGES = {
  permission: "Mikrofonzugriff wurde nicht erlaubt.",
  noDevice: "Es wurde kein verfügbares Mikrofon gefunden.",
  unsupported: "Die Audioaufnahme wird von diesem Browser nicht unterstützt.",
  unavailable: "Das Mikrofon konnte nicht geöffnet werden.",
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

class AudioRecorderError extends Error {
  constructor(message: string) {
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
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<Blob> | null = null;
  private resolveStop: ((blob: Blob) => void) | null = null;
  private rejectStop: ((error: Error) => void) | null = null;
  private disposed = false;

  constructor(dependencies: AudioRecorderDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot() {
    return this.snapshot;
  }

  clearError() {
    if (this.snapshot.status !== "error") return;
    this.update({ status: "idle", error: null });
  }

  startRecording() {
    if (this.startPromise) return this.startPromise;
    if (this.snapshot.status === "recording") return Promise.resolve();
    if (this.snapshot.status === "stopping") {
      return Promise.reject(new AudioRecorderError(ERROR_MESSAGES.start));
    }

    const promise = this.start();
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

  private async start() {
    if (this.disposed) throw new AudioRecorderError(ERROR_MESSAGES.start);
    if (!this.dependencies.createRecorder) {
      const error = new AudioRecorderError(ERROR_MESSAGES.unsupported);
      this.update({ status: "error", error: error.message });
      throw error;
    }
    if (!this.dependencies.getUserMedia) {
      const error = new AudioRecorderError(ERROR_MESSAGES.noDevice);
      this.update({ status: "error", error: error.message });
      throw error;
    }

    this.update({
      status: "starting",
      error: null,
      audioBlob: null,
      mimeType: null,
    });

    let stream: MediaStream | null = null;
    try {
      stream = await this.dependencies.getUserMedia();
      if (this.disposed) {
        this.stopTracks(stream);
        stream = null;
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
      recorder.addEventListener("dataavailable", this.handleDataAvailable);
      recorder.addEventListener("stop", this.handleStop);
      recorder.addEventListener("error", this.handleRecorderError);
      recorder.start();

      this.update({
        status: "recording",
        error: null,
        audioBlob: null,
        mimeType: recorder.mimeType || selectedMimeType || null,
      });
    } catch (error) {
      if (stream) this.stopTracks(stream);
      this.releaseRecorder();
      const message = getAudioRecorderErrorMessage(error);
      this.update({ status: "error", error: message });
      throw new AudioRecorderError(message);
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
    this.removeRecorderListeners();
    this.rejectStop?.(new AudioRecorderError(ERROR_MESSAGES.stop));
    this.clearStopPromise();
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
  }

  private handleDataAvailable = (event: BlobEvent) => {
    if (event.data?.size > 0) this.chunks.push(event.data);
  };

  private handleStop = () => {
    const recorder = this.recorder;
    const mimeType =
      recorder?.mimeType ||
      this.chunks.find((chunk) => Boolean(chunk.type))?.type ||
      this.snapshot.mimeType ||
      "";
    const blob = new Blob(this.chunks, { type: mimeType });

    this.stopTracks(this.stream);
    this.removeRecorderListeners();
    this.recorder = null;
    this.stream = null;
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
    this.releaseRecorder();
    this.update({ status: "error", error: error.message });
    this.rejectStop?.(error);
    this.clearStopPromise();
  }

  private releaseRecorder() {
    this.removeRecorderListeners();
    this.recorder = null;
    this.stream = null;
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
