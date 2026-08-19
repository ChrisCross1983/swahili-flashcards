import { describe, expect, it, vi } from "vitest";
import { TranslatorPipelineError } from "@/lib/translator/server/errors";
import {
  translateRecordedAudio,
  type TranslatorAiGateway,
} from "@/lib/translator/server/translate";

const input = {
  audio: new Blob(["audio"], { type: "audio/webm" }),
  format: { extension: "webm", mimeType: "audio/webm" } as const,
  direction: { sourceLanguage: "sw", targetLanguage: "de" } as const,
};

function createGateway(): TranslatorAiGateway {
  return {
    transcribe: vi.fn(async () => ({
      text: " Tutakuja kesho asubuhi. ",
      detectedLanguage: "sw" as const,
    })),
    classifyLanguage: vi.fn(async () => "sw" as const),
    translate: vi.fn(async () => " Wir kommen morgen früh. "),
  };
}

describe("translator server pipeline", () => {
  it("runs transcription before translation and returns trimmed text", async () => {
    const order: string[] = [];
    const gateway: TranslatorAiGateway = {
      transcribe: vi.fn(async (request) => {
        order.push("transcription");
        expect(request).toMatchObject({
          fileName: "recording.webm",
          extension: "webm",
          originalMimeType: "audio/webm",
          normalizedMimeType: "audio/webm",
          language: "sw",
        });
        return {
          text: " Tutakuja kesho asubuhi. ",
          detectedLanguage: "sw" as const,
        };
      }),
      classifyLanguage: vi.fn(async () => "sw" as const),
      translate: vi.fn(async (text, direction) => {
        order.push("translation");
        expect(text).toBe("Tutakuja kesho asubuhi.");
        expect(direction).toEqual(input.direction);
        return " Wir kommen morgen früh. ";
      }),
    };

    await expect(translateRecordedAudio(input, gateway)).resolves.toEqual({
      originalText: "Tutakuja kesho asubuhi.",
      translatedText: "Wir kommen morgen früh.",
      sourceLanguage: "sw",
      targetLanguage: "de",
    });
    expect(order).toEqual(["transcription", "translation"]);
    expect(gateway.classifyLanguage).not.toHaveBeenCalled();
  });

  it("does not translate an empty or content-free transcript", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.transcribe).mockResolvedValue({
      text: " ... ",
      detectedLanguage: "sw",
    });

    await expect(translateRecordedAudio(input, gateway)).rejects.toMatchObject({
      code: "no_speech",
    } satisfies Partial<TranslatorPipelineError>);
    expect(gateway.translate).not.toHaveBeenCalled();
  });

  it("uses the detected AUTO language and translates to the opposite language", async () => {
    const gateway = createGateway();
    const autoInput = {
      ...input,
      direction: { sourceLanguage: "auto", targetLanguage: "auto" } as const,
    };

    await expect(translateRecordedAudio(autoInput, gateway)).resolves.toEqual({
      originalText: "Tutakuja kesho asubuhi.",
      translatedText: "Wir kommen morgen früh.",
      sourceLanguage: "sw",
      targetLanguage: "de",
    });
    expect(gateway.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ language: null }),
    );
    expect(gateway.translate).toHaveBeenCalledWith(
      "Tutakuja kesho asubuhi.",
      { sourceLanguage: "sw", targetLanguage: "de" },
    );
  });

  it.each([
    ["sw", { sourceLanguage: "sw", targetLanguage: "de" }],
    ["de", { sourceLanguage: "de", targetLanguage: "sw" }],
  ] as const)(
    "uses the fallback classifier result %s when Whisper is inconclusive",
    async (classifiedLanguage, expectedDirection) => {
      const gateway = createGateway();
      vi.mocked(gateway.transcribe).mockResolvedValue({
        text: "Habari yako?",
        detectedLanguage: null,
      });
      vi.mocked(gateway.classifyLanguage).mockResolvedValue(classifiedLanguage);

      await translateRecordedAudio(
        {
          ...input,
          direction: { sourceLanguage: "auto", targetLanguage: "auto" },
        },
        gateway,
      );

      expect(gateway.classifyLanguage).toHaveBeenCalledOnce();
      expect(gateway.classifyLanguage).toHaveBeenCalledWith("Habari yako?");
      expect(gateway.translate).toHaveBeenCalledWith(
        "Habari yako?",
        expectedDirection,
      );
    },
  );

  it("requires manual selection when the fallback is also inconclusive", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.transcribe).mockResolvedValue({
      text: "Hello there",
      detectedLanguage: null,
    });
    vi.mocked(gateway.classifyLanguage).mockResolvedValue(null);

    await expect(
      translateRecordedAudio(
        {
          ...input,
          direction: { sourceLanguage: "auto", targetLanguage: "auto" },
        },
        gateway,
      ),
    ).rejects.toMatchObject({ code: "unsupported_language" });
    expect(gateway.classifyLanguage).toHaveBeenCalledWith("Hello there");
    expect(gateway.translate).not.toHaveBeenCalled();
  });

  it("does not classify language for a manual direction", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.transcribe).mockResolvedValue({
      text: "Guten Morgen.",
      detectedLanguage: null,
    });

    await translateRecordedAudio(
      {
        ...input,
        direction: { sourceLanguage: "de", targetLanguage: "sw" },
      },
      gateway,
    );

    expect(gateway.classifyLanguage).not.toHaveBeenCalled();
    expect(gateway.translate).toHaveBeenCalledWith("Guten Morgen.", {
      sourceLanguage: "de",
      targetLanguage: "sw",
    });
  });

  it("classifies transcription and translation failures", async () => {
    const transcriptionFailure = createGateway();
    vi.mocked(transcriptionFailure.transcribe).mockRejectedValue(
      new Error("OpenAI transcription request failed"),
    );
    await expect(
      translateRecordedAudio(input, transcriptionFailure),
    ).rejects.toMatchObject({ code: "transcription_failed" });

    const translationFailure = createGateway();
    vi.mocked(translationFailure.translate).mockRejectedValue(
      new Error("OpenAI translation request failed"),
    );
    await expect(
      translateRecordedAudio(input, translationFailure),
    ).rejects.toMatchObject({ code: "translation_failed" });
  });
});
