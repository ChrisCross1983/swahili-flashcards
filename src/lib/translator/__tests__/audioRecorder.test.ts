import { describe, expect, it, vi } from "vitest";
import {
  AudioRecorderController,
  getAudioRecorderErrorMessage,
  selectSupportedAudioMimeType,
} from "@/lib/translator/audioRecorder";

class FakeMediaRecorder {
  state: RecordingState = "inactive";
  mimeType: string;
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    queueMicrotask(() => this.emit("stop", new Event("stop")));
  });
  addEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    },
  );
  removeEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      this.listeners.get(type)?.delete(listener);
    },
  );
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(mimeType = "audio/webm;codecs=opus") {
    this.mimeType = mimeType;
  }

  emitData(data: Blob) {
    this.emit("dataavailable", { data } as BlobEvent);
  }

  private emit(type: string, event: Event) {
    this.listeners.get(type)?.forEach((listener) => {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    });
  }
}

function createTrack() {
  return {
    stop: vi.fn(),
    enabled: true,
    muted: false,
    readyState: "live",
  } as unknown as MediaStreamTrack;
}

function createStream(track: MediaStreamTrack) {
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
}

function createHarness(options?: {
  getUserMedia?: () => Promise<MediaStream>;
  supportedTypes?: string[];
  acquisitionTimeoutMs?: number;
  shouldReuseStream?: (stream: MediaStream) => boolean;
}) {
  const track = createTrack();
  const stream = createStream(track);
  const recorder = new FakeMediaRecorder();
  const getUserMedia = vi.fn(options?.getUserMedia ?? (async () => stream));
  const createRecorder = vi.fn(
    (_stream: MediaStream, mimeType: string) => {
      recorder.mimeType = mimeType || "audio/mp4";
      return recorder as unknown as MediaRecorder;
    },
  );
  const supportedTypes = options?.supportedTypes ?? ["audio/webm;codecs=opus"];
  const controller = new AudioRecorderController({
    getUserMedia,
    createRecorder,
    isTypeSupported: (mimeType) => supportedTypes.includes(mimeType),
    acquisitionTimeoutMs: options?.acquisitionTimeoutMs,
    shouldReuseStream: options?.shouldReuseStream,
  });

  return { controller, createRecorder, getUserMedia, recorder, stream, track };
}

describe("AudioRecorderController", () => {
  it("prepares the microphone without starting MediaRecorder until realtime is ready", async () => {
    const { controller, recorder, stream } = createHarness();

    await expect(controller.prepareRecording()).resolves.toBe(stream);

    expect(controller.getSnapshot().status).toBe("starting");
    expect(controller.getMediaStream()).toBe(stream);
    expect(recorder.start).not.toHaveBeenCalled();

    await controller.startPreparedRecording();

    expect(recorder.start).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().status).toBe("recording");
    controller.dispose();
  });

  it("starts a real recorder only after microphone access succeeds", async () => {
    const { controller, createRecorder, getUserMedia, recorder, stream } =
      createHarness();

    await controller.startRecording();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(createRecorder).toHaveBeenCalledWith(
      stream,
      "audio/webm;codecs=opus",
    );
    expect(recorder.start).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().status).toBe("recording");
    expect(controller.getMediaStream()).toBe(stream);
  });

  it("combines audio chunks into one blob and preserves the recorder MIME type", async () => {
    const { controller, recorder } = createHarness();
    await controller.startRecording();
    recorder.emitData(new Blob(["audio-"]));
    recorder.emitData(new Blob(["data"]));

    const blob = await controller.stopRecording();

    expect(await blob.text()).toBe("audio-data");
    expect(blob.type).toBe("audio/webm;codecs=opus");
    expect(controller.getSnapshot()).toMatchObject({
      status: "idle",
      audioBlob: blob,
      mimeType: "audio/webm;codecs=opus",
    });
    expect(controller.getMediaStream()).not.toBeNull();
    expect(recorder.start).toHaveBeenCalledWith(1_000);
    expect(controller.getCaptureDiagnostics()).toMatchObject({
      mediaRecorderChunkCount: 2,
      mediaRecorderTotalChunkBytes: 10,
    });
  });

  it("keeps and gates the microphone track after recording stops", async () => {
    const { controller, track } = createHarness();
    await controller.startRecording();

    await controller.stopRecording();
    controller.suspendMicrophone();

    expect(track.stop).not.toHaveBeenCalled();
    expect(track.enabled).toBe(false);
  });

  it("starts a fresh complete recording after the previous recording stops", async () => {
    const { controller, getUserMedia, recorder } = createHarness();

    await controller.startRecording();
    await controller.stopRecording();
    await controller.startRecording();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(recorder.start).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().status).toBe("recording");
    controller.dispose();
  });

  it("releases the retained microphone explicitly after idle", async () => {
    const { controller, track } = createHarness();
    await controller.startRecording();
    await controller.stopRecording();

    expect(controller.releaseMicrophone()).toBe(true);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(controller.getMediaStream()).toBeNull();
  });

  it("maps denied microphone permission to a user-facing error", async () => {
    const permissionError = Object.assign(new Error("denied"), {
      name: "NotAllowedError",
    });
    const { controller } = createHarness({
      getUserMedia: async () => Promise.reject(permissionError),
    });

    await expect(controller.startRecording()).rejects.toThrow(
      "Mikrofonzugriff ist nicht erlaubt.",
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "idle",
      error: "Mikrofonzugriff ist nicht erlaubt. Bitte erlaube den Mikrofonzugriff in den Browser-Einstellungen.",
    });
    expect(getAudioRecorderErrorMessage(permissionError)).toBe(
      "Mikrofonzugriff ist nicht erlaubt. Bitte erlaube den Mikrofonzugriff in den Browser-Einstellungen.",
    );
  });

  it("recovers if the browser throws synchronously while opening the microphone", async () => {
    const { controller } = createHarness({
      getUserMedia: () => {
        throw Object.assign(new Error("busy"), { name: "NotReadableError" });
      },
    });

    await expect(controller.startRecording()).rejects.toThrow(
      "Das Mikrofon ist gerade nicht verfügbar",
    );
    expect(controller.getSnapshot().status).toBe("idle");
    expect(controller.hasPendingAcquisition()).toBe(false);
    expect(controller.getCaptureDiagnostics().microphoneAcquisitionOutcome)
      .toBe("device_unavailable");
  });

  it("coalesces two fast start requests into one recorder instance", async () => {
    let resolveStream: ((stream: MediaStream) => void) | undefined;
    const pendingStream = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const { controller, createRecorder, getUserMedia, stream } = createHarness({
      getUserMedia: () => pendingStream,
    });

    const firstStart = controller.startRecording();
    const secondStart = controller.startRecording();
    resolveStream?.(stream);
    await Promise.all([firstStart, secondStart]);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(createRecorder).toHaveBeenCalledTimes(1);
  });

  it("releases recorder listeners and microphone tracks when disposed", async () => {
    const { controller, recorder, track } = createHarness();
    await controller.startRecording();

    controller.dispose();

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(recorder.removeEventListener).toHaveBeenCalledTimes(3);
  });

  it("releases a microphone stream that arrives after disposal", async () => {
    let resolveStream: ((stream: MediaStream) => void) | undefined;
    const pendingStream = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const { controller, createRecorder, stream, track } = createHarness({
      getUserMedia: () => pendingStream,
    });

    const start = controller.startRecording();
    controller.dispose();
    resolveStream?.(stream);

    await expect(start).rejects.toThrow("Die Aufnahme konnte nicht gestartet werden.");
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(createRecorder).not.toHaveBeenCalled();
  });

  it("uses the browser default format when no candidate is supported", () => {
    expect(selectSupportedAudioMimeType(() => false)).toBe("");
  });

  it("times out a hanging microphone request and permits a fresh attempt", async () => {
    vi.useFakeTimers();
    const first = new Promise<MediaStream>(() => undefined);
    const secondTrack = createTrack();
    const secondStream = createStream(secondTrack);
    const getUserMedia = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(secondStream);
    const { controller } = createHarness({
      getUserMedia,
      acquisitionTimeoutMs: 50,
    });

    const attempt = controller.startRecording();
    await vi.advanceTimersByTimeAsync(50);
    await expect(attempt).rejects.toThrow("Das Mikrofon konnte nicht geöffnet werden");
    expect(controller.getSnapshot().status).toBe("idle");
    expect(controller.hasPendingAcquisition()).toBe(false);
    expect(controller.getMicrophoneAcquisitionState()).toBe("timed_out");
    expect(controller.getCaptureDiagnostics()).toMatchObject({
      microphoneAcquisitionOutcome: "timeout",
      freshStreamRequested: true,
    });

    await expect(controller.startRecording()).resolves.toBeUndefined();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(controller.getMediaStream()).toBe(secondStream);
    vi.useRealTimers();
  });

  it("stops a stale stream that resolves after timeout without replacing the new generation", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (stream: MediaStream) => void;
    const firstPromise = new Promise<MediaStream>((resolve) => {
      resolveFirst = resolve;
    });
    const oldTrack = createTrack();
    const oldStream = createStream(oldTrack);
    const newTrack = createTrack();
    const newStream = createStream(newTrack);
    const getUserMedia = vi.fn()
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(newStream);
    const { controller } = createHarness({
      getUserMedia,
      acquisitionTimeoutMs: 50,
    });

    const firstAttempt = controller.startRecording();
    await vi.advanceTimersByTimeAsync(50);
    await expect(firstAttempt).rejects.toThrow();
    await controller.startRecording();
    expect(controller.getMediaStream()).toBe(newStream);

    resolveFirst(oldStream);
    await Promise.resolve();

    expect(oldTrack.stop).toHaveBeenCalledOnce();
    expect(newTrack.stop).not.toHaveBeenCalled();
    expect(controller.getMediaStream()).toBe(newStream);
    vi.useRealTimers();
  });

  it("requests a fresh stream per turn when capture reuse is disabled", async () => {
    const firstTrack = createTrack();
    const secondTrack = createTrack();
    const streams = [createStream(firstTrack), createStream(secondTrack)];
    const { controller, getUserMedia } = createHarness({
      getUserMedia: vi.fn()
        .mockResolvedValueOnce(streams[0])
        .mockResolvedValueOnce(streams[1]),
      shouldReuseStream: () => false,
    });

    await controller.startRecording();
    await controller.stopRecording();
    controller.suspendMicrophone();
    await controller.startRecording();

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(firstTrack.stop).toHaveBeenCalled();
    expect(controller.getMediaStream()).toBe(streams[1]);
  });

  it("falls back to the browser default when a claimed MIME type is rejected", async () => {
    const track = createTrack();
    const stream = createStream(track);
    const recorder = new FakeMediaRecorder("audio/mp4");
    const createRecorder = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new DOMException("unsupported", "NotSupportedError");
      })
      .mockImplementationOnce(() => recorder as unknown as MediaRecorder);
    const controller = new AudioRecorderController({
      getUserMedia: async () => stream,
      createRecorder,
      isTypeSupported: (mimeType) => mimeType === "audio/webm;codecs=opus",
    });

    await controller.startRecording();

    expect(createRecorder).toHaveBeenNthCalledWith(
      1,
      stream,
      "audio/webm;codecs=opus",
    );
    expect(createRecorder).toHaveBeenNthCalledWith(2, stream, "");
    expect(controller.getSnapshot().mimeType).toBe("audio/mp4");
    controller.dispose();
  });

  it("cleans up a recoverable recorder start failure and allows a fresh stream", async () => {
    const firstTrack = createTrack();
    const secondTrack = createTrack();
    const firstStream = createStream(firstTrack);
    const secondStream = createStream(secondTrack);
    const broken = new FakeMediaRecorder();
    broken.start.mockImplementationOnce(() => {
      throw new Error("device lost");
    });
    const working = new FakeMediaRecorder();
    const createRecorder = vi.fn()
      .mockReturnValueOnce(broken as unknown as MediaRecorder)
      .mockReturnValueOnce(working as unknown as MediaRecorder);
    const controller = new AudioRecorderController({
      getUserMedia: vi.fn()
        .mockResolvedValueOnce(firstStream)
        .mockResolvedValueOnce(secondStream),
      createRecorder,
      shouldReuseStream: () => false,
      isTypeSupported: () => true,
    });

    await expect(controller.startRecording()).rejects.toThrow();
    expect(controller.getSnapshot().status).toBe("idle");
    expect(firstTrack.stop).toHaveBeenCalled();

    await expect(controller.startRecording()).resolves.toBeUndefined();
    expect(controller.getMediaStream()).toBe(secondStream);
    expect(working.start).toHaveBeenCalledOnce();
  });
});
