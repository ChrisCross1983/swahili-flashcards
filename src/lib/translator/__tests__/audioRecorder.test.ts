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
  return { stop: vi.fn() } as unknown as MediaStreamTrack;
}

function createStream(track: MediaStreamTrack) {
  return {
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function createHarness(options?: {
  getUserMedia?: () => Promise<MediaStream>;
  supportedTypes?: string[];
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
  });

  return { controller, createRecorder, getUserMedia, recorder, stream, track };
}

describe("AudioRecorderController", () => {
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
  });

  it("stops every microphone track after recording stops", async () => {
    const { controller, track } = createHarness();
    await controller.startRecording();

    await controller.stopRecording();

    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("maps denied microphone permission to a user-facing error", async () => {
    const permissionError = Object.assign(new Error("denied"), {
      name: "NotAllowedError",
    });
    const { controller } = createHarness({
      getUserMedia: async () => Promise.reject(permissionError),
    });

    await expect(controller.startRecording()).rejects.toThrow(
      "Mikrofonzugriff wurde nicht erlaubt.",
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "error",
      error: "Mikrofonzugriff wurde nicht erlaubt.",
    });
    expect(getAudioRecorderErrorMessage(permissionError)).toBe(
      "Mikrofonzugriff wurde nicht erlaubt.",
    );
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
});
