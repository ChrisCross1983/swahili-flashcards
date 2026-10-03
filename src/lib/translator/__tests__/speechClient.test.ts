import { describe, expect, it, vi } from "vitest";
import {
  getTranslatorSpeechFailure,
  isSpeechPlaybackBlockedError,
  requestTranslatorSpeech,
  TranslatorSpeechClientError,
} from "@/lib/translator/speechClient";

describe("translator speech client", () => {
  it("requests target-language speech and returns its blob", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("?correlationId=")
        ? Response.json({
            ttsOpenAiTimeToFirstByteMs: 120,
            ttsOpenAiTotalMs: 300,
          })
        : new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "X-Translator-Speech-Model": "gpt-4o-mini-tts",
          "X-Translator-Speech-Generation-Ms": "321",
          "X-Translator-Correlation-Id": "tts-turn-1",
        },
      }),
    );

    const result = await requestTranslatorSpeech("Habari", "sw", 1.15, { fetcher });

    expect(result.audio).toMatchObject({ size: 3, type: "audio/mpeg" });
    expect(result.diagnostics).toMatchObject({
      ttsModel: "gpt-4o-mini-tts",
      ttsGenerationMs: 321,
      ttsRequestMs: expect.any(Number),
      ttsRequestCorrelationId: "tts-turn-1",
      ttsClientFirstByteAt: expect.any(String),
      ttsClientResponseCompletedAt: expect.any(String),
      ttsStreamingUsed: true,
      ttsInputTextLength: 6,
      ttsAudioByteLength: 3,
      ttsAudioMimeType: "audio/mpeg",
    });
    await expect(result.serverDiagnostics).resolves.toMatchObject({
      ttsOpenAiTimeToFirstByteMs: 120,
      ttsOpenAiTotalMs: 300,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/translator/speech",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Habari", language: "sw", speed: 1.15 }),
      }),
    );
  });

  it("preserves ordered stream bytes and content type in the playback blob", async () => {
    const chunks = [
      new Uint8Array([99, 1, 2, 99]).subarray(1, 3),
      new Uint8Array([88, 3, 4, 88]).subarray(1, 3),
    ];
    const fetcher = vi.fn(async () => new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
      { headers: { "Content-Type": "audio/mp4" } },
    ));

    const result = await requestTranslatorSpeech("Habari", "sw", 1, { fetcher });

    expect(result.audio).toBeInstanceOf(Blob);
    expect(result.audio.type).toBe("audio/mp4");
    expect(Array.from(new Uint8Array(await result.audio.arrayBuffer()))).toEqual([
      1, 2, 3, 4,
    ]);
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

  it("preserves a client abort while reading streamed audio", async () => {
    const abortError = new DOMException("request stopped", "AbortError");
    const fetcher = vi.fn(async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(abortError);
          },
        }),
        {
          headers: {
            "Content-Type": "audio/mpeg",
            "X-Translator-Speech-Model": "gpt-4o-mini-tts",
          },
        },
      ),
    );

    await expect(
      requestTranslatorSpeech("Hallo", "de", 1, { fetcher }),
    ).rejects.toBe(abortError);
  });
});
