import { describe, expect, it } from "vitest";
import {
  getSupportedAudioFormat,
  normalizeAudioMimeType,
} from "@/lib/translator/audioFormats";

describe("translator audio formats", () => {
  it("normalizes MediaRecorder codec parameters", () => {
    expect(normalizeAudioMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(getSupportedAudioFormat("audio/webm;codecs=opus")).toEqual({
      extension: "webm",
      mimeType: "audio/webm",
    });
  });

  it("maps Safari-style MP4 audio and rejects unsupported OGG", () => {
    expect(getSupportedAudioFormat("audio/mp4")).toEqual({
      extension: "mp4",
      mimeType: "audio/mp4",
    });
    expect(getSupportedAudioFormat("audio/ogg;codecs=opus")).toBeNull();
  });
});
