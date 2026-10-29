import { describe, expect, it, vi } from "vitest";
import {
  REALTIME_TTS_QA_CASES,
  disposeRealtimeTtsQaRun,
  realtimeTtsQaPreviewEnabled,
  realtimeTtsQaResponse,
} from "../realtimeTtsQa";

describe("isolated realtime TTS QA", () => {
  it("is enabled only for the named preview branch", () => {
    expect(realtimeTtsQaPreviewEnabled({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "perf/translator-region-fra1-test" })).toBe(true);
    expect(realtimeTtsQaPreviewEnabled({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "perf/translator-region-fra1-test" })).toBe(false);
    expect(realtimeTtsQaPreviewEnabled({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" })).toBe(false);
    expect(realtimeTtsQaPreviewEnabled({})).toBe(false);
  });

  it("sends the input unchanged as a single audio response on the standard WebRTC output path", () => {
    for (const testCase of REALTIME_TTS_QA_CASES) {
      const event = realtimeTtsQaResponse(testCase.text, testCase.language);
      expect(event.response.input[0].content[0].text).toBe(testCase.text);
      expect(event.response.output_modalities).toEqual(["audio"]);
      expect(event.response.conversation).toBe("auto");
      expect(event.response.tools).toEqual([]);
    }
    expect(REALTIME_TTS_QA_CASES.filter((item) => item.language === "de")).toHaveLength(5);
    expect(REALTIME_TTS_QA_CASES.filter((item) => item.language === "sw")).toHaveLength(5);
  });

  it("aborts and releases the media session", () => {
    const controller = new AbortController();
    const peer = { close: vi.fn() };
    const audio = { pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn(), srcObject: {} as MediaStream };
    disposeRealtimeTtsQaRun({ controller, peer, audio });
    expect(controller.signal.aborted).toBe(true);
    expect(peer.close).toHaveBeenCalledOnce();
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.srcObject).toBeNull();
    expect(audio.load).toHaveBeenCalledOnce();
  });
});
