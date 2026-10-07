import { afterEach, describe, expect, it, vi } from "vitest";
import {
  nativeMediaCurrentSrcForDiagnostics,
  nativeMediaErrorMessageForDiagnostics,
  readNativeMediaResourceDiagnostics,
  requestNativeProgressiveSpeech,
  readNativeMediaResponseEnd,
} from "@/lib/translator/nativeProgressiveSpeechClient";

const mediaUrl = `/api/translator/speech/native/${"a".repeat(24)}.mp3`;

describe("native progressive speech client", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("calls Window.fetch with its Window receiver for WebKit", async () => {
    const browser = {
      fetch(this: { fetch: unknown }) {
        if (this !== browser) throw new TypeError("Can only call Window.fetch on instances of Window");
        return Promise.resolve(Response.json({ mediaUrl }));
      },
    };
    vi.stubGlobal("window", browser);
    await expect(requestNativeProgressiveSpeech("Habari", "sw", 1, new AbortController().signal))
      .resolves.toBe(mediaUrl);
  });
  it("sends the exact full Terra text only in the authenticated POST body", async () => {
    const fetcher = vi.fn(async () => Response.json({ mediaUrl })) as unknown as typeof fetch;
    const text = "Habari, kijiji! Sema tena.";
    expect(await requestNativeProgressiveSpeech(text, "sw", 1, new AbortController().signal, fetcher)).toBe(mediaUrl);
    expect(fetcher).toHaveBeenCalledWith("/api/translator/speech/native", expect.objectContaining({
      method: "POST", credentials: "same-origin", cache: "no-store",
      body: JSON.stringify({ text, language: "sw", speed: 1 }),
    }));
    expect(mediaUrl).not.toContain(text);
  });

  it("rejects a media URL containing text or another origin", async () => {
    const fetcher = vi.fn(async () => Response.json({ mediaUrl: "https://evil.test/speech?text=secret" })) as unknown as typeof fetch;
    await expect(requestNativeProgressiveSpeech("secret", "de", 1, new AbortController().signal, fetcher))
      .rejects.toMatchObject({ reason: "media_ticket_invalid_response" });
  });

  it("does not invent Resource Timing when Safari omits it", () => {
    expect(readNativeMediaResponseEnd(mediaUrl, performance.now())).toBeNull();
    expect(readNativeMediaResourceDiagnostics(mediaUrl, performance.now())).toBeNull();
  });

  it("redacts media IDs and redirect query parameters from exported diagnostics", () => {
    vi.stubGlobal("location", { origin: "https://preview.example" });
    expect(nativeMediaCurrentSrcForDiagnostics(`https://preview.example${mediaUrl}?token=sensitive`))
      .toBe("https://preview.example/api/translator/speech/native/<media-id>.mp3");
    expect(nativeMediaErrorMessageForDiagnostics(`Failed https://preview.example${mediaUrl}?token=sensitive`))
      .toBe("Failed [media URL]");
    expect(nativeMediaCurrentSrcForDiagnostics("https://preview.example/sso-api?secret=hidden"))
      .toBe("https://preview.example/<non-media-path>");
  });

  it("reads same-origin HTTP status when Resource Timing exposes it", () => {
    vi.stubGlobal("location", { origin: "https://preview.example" });
    const started = performance.now();
    vi.spyOn(performance, "getEntriesByName").mockReturnValue([{
      startTime: started + 1, requestStart: started + 2,
      responseStart: started + 3, responseEnd: started + 4,
      responseStatus: 416, transferSize: 320,
    } as PerformanceResourceTiming]);
    expect(readNativeMediaResourceDiagnostics(mediaUrl, started)).toMatchObject({
      progressiveTtsMediaResourceObserved: true,
      progressiveTtsMediaResourceResponseStatus: 416,
      progressiveTtsMediaResourceTransferSizeBytes: 320,
    });
  });
});
