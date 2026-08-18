import { describe, expect, it, vi } from "vitest";
import {
  requestTranslatorSpeech,
  TranslatorSpeechClientError,
} from "@/lib/translator/speechClient";

describe("translator speech client", () => {
  it("requests target-language speech and returns its blob", async () => {
    const fetcher = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );

    const result = await requestTranslatorSpeech("Habari", "sw", { fetcher });

    expect(result).toMatchObject({ size: 3, type: "audio/mpeg" });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/translator/speech",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Habari", language: "sw" }),
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

    await expect(
      requestTranslatorSpeech("Hallo", "de", { fetcher }),
    ).rejects.toBeInstanceOf(TranslatorSpeechClientError);
  });
});
