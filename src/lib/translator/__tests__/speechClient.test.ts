import { describe, expect, it, vi } from "vitest";
import {
  getTranslatorSpeechFailure,
  isSpeechPlaybackBlockedError,
  requestTranslatorSpeech,
  TranslatorSpeechClientError,
} from "@/lib/translator/speechClient";

describe("translator speech client", () => {
  it("requests target-language speech and returns its blob", async () => {
    const fetcher = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "X-Translator-Speech-Model": "gpt-4o-mini-tts",
          "X-Translator-Speech-Generation-Ms": "321",
        },
      }),
    );

    const result = await requestTranslatorSpeech("Habari", "sw", 1.15, { fetcher });

    expect(result.audio).toMatchObject({ size: 3, type: "audio/mpeg" });
    expect(result.diagnostics).toEqual({
      ttsModel: "gpt-4o-mini-tts",
      ttsGenerationMs: 321,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/translator/speech",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Habari", language: "sw", speed: 1.15 }),
      }),
    );
  });

  it("maps API failures to a generic speech error", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: "sensitive upstream error" },
        { status: 502 },
      ),
    );

    const request = requestTranslatorSpeech("Hallo", "de", 1, { fetcher });
    await expect(request).rejects.toBeInstanceOf(TranslatorSpeechClientError);
    await request.catch((error) => {
      expect(getTranslatorSpeechFailure(error, true)).toEqual({
        kind: "generation",
        message: "Die Sprachausgabe konnte nicht erstellt werden.",
      });
    });
  });

  it("recognizes only autoplay policy failures as blocked playback", () => {
    expect(
      isSpeechPlaybackBlockedError(
        new DOMException("Playback is not allowed", "NotAllowedError"),
      ),
    ).toBe(true);
    expect(
      isSpeechPlaybackBlockedError(
        new Error("play() failed because the user didn't interact"),
      ),
    ).toBe(true);
    expect(
      isSpeechPlaybackBlockedError(
        new DOMException("Unsupported audio", "NotSupportedError"),
      ),
    ).toBe(false);
  });
});
