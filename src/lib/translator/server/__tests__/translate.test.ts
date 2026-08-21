import { afterEach, describe, expect, it, vi } from "vitest";
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
      model: "gpt-4o-transcribe",
      fallbackUsed: false,
    })),
    autoTranslate: vi.fn(async () => ({
      sourceLanguage: "sw" as const,
      targetLanguage: "de" as const,
      translatedText: "Wir kommen morgen früh.",
    })),
    translate: vi.fn(async () => " Wir kommen morgen früh. "),
  };
}

describe("translator server pipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

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
          model: "gpt-4o-transcribe",
          fallbackUsed: false,
        };
      }),
      autoTranslate: vi.fn(async () => ({
        sourceLanguage: "sw" as const,
        targetLanguage: "de" as const,
        translatedText: "Wir kommen morgen früh.",
      })),
      translate: vi.fn(async (text, direction) => {
        order.push("translation");
        expect(text).toBe("Tutakuja kesho asubuhi.");
        expect(direction).toEqual(input.direction);
        return " Wir kommen morgen früh. ";
      }),
    };

    await expect(translateRecordedAudio(input, gateway)).resolves.toMatchObject({
      originalText: "Tutakuja kesho asubuhi.",
      translatedText: "Wir kommen morgen früh.",
      sourceLanguage: "sw",
      targetLanguage: "de",
    });
    expect(order).toEqual(["transcription", "translation"]);
    expect(gateway.autoTranslate).not.toHaveBeenCalled();
  });

  it("does not translate an empty or content-free transcript", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.transcribe).mockResolvedValue({
      text: " ... ",
      detectedLanguage: "sw",
      model: "gpt-4o-transcribe",
      fallbackUsed: false,
    });

    await expect(translateRecordedAudio(input, gateway)).rejects.toMatchObject({
      code: "no_speech",
    } satisfies Partial<TranslatorPipelineError>);
    expect(gateway.translate).not.toHaveBeenCalled();
    expect(gateway.autoTranslate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "sw",
      "Habari yako?",
      "Wie geht es dir?",
      { sourceLanguage: "sw", targetLanguage: "de" },
    ],
    [
      "de",
      "Wie geht es dir?",
      "Habari yako?",
      { sourceLanguage: "de", targetLanguage: "sw" },
    ],
  ] as const)(
    "combines AUTO %s detection and translation in one request",
    async (sourceLanguage, transcript, translatedText, expectedDirection) => {
      const gateway = createGateway();
      vi.mocked(gateway.transcribe).mockResolvedValue({
        text: transcript,
        detectedLanguage: null,
        model: "gpt-4o-transcribe",
        fallbackUsed: false,
      });
      vi.mocked(gateway.autoTranslate).mockResolvedValue({
        ...expectedDirection,
        translatedText,
      });

      await expect(translateRecordedAudio(
        {
          ...input,
          direction: { sourceLanguage: "auto", targetLanguage: "auto" },
        },
        gateway,
      )).resolves.toMatchObject({
        originalText: transcript,
        translatedText,
        ...expectedDirection,
      });

      expect(sourceLanguage).toBe(expectedDirection.sourceLanguage);
      expect(gateway.transcribe).toHaveBeenCalledOnce();
      expect(gateway.autoTranslate).toHaveBeenCalledOnce();
      expect(gateway.autoTranslate).toHaveBeenCalledWith(transcript);
      expect(gateway.translate).not.toHaveBeenCalled();
      expect(gateway.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ language: null }),
      );
    },
  );

  it("requires manual selection when combined AUTO returns unknown", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.transcribe).mockResolvedValue({
      text: "Hello there",
      detectedLanguage: null,
      model: "gpt-4o-transcribe",
      fallbackUsed: false,
    });
    vi.mocked(gateway.autoTranslate).mockResolvedValue({
      sourceLanguage: "unknown",
      targetLanguage: null,
      translatedText: null,
    });

    await expect(
      translateRecordedAudio(
        {
          ...input,
          direction: { sourceLanguage: "auto", targetLanguage: "auto" },
        },
        gateway,
      ),
    ).rejects.toMatchObject({ code: "unsupported_language" });
    expect(gateway.autoTranslate).toHaveBeenCalledWith("Hello there");
    expect(gateway.translate).not.toHaveBeenCalled();
  });

  it("reports one combined AUTO timing without classifier or manual translation timing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const gateway = createGateway();

    await translateRecordedAudio(
      {
        ...input,
        direction: { sourceLanguage: "auto", targetLanguage: "auto" },
      },
      gateway,
    );

    expect(infoSpy).toHaveBeenCalledWith(
      "[translator] timings",
      expect.objectContaining({
        transcriptionMs: expect.any(Number),
        autoTranslateMs: expect.any(Number),
        totalMs: expect.any(Number),
      }),
    );
    const timing = infoSpy.mock.calls.find(
      ([message]) => message === "[translator] timings",
    )?.[1] as Record<string, unknown>;
    expect(timing).not.toHaveProperty("languageClassificationMs");
    expect(timing).not.toHaveProperty("translationMs");
  });

  it("returns safe pipeline diagnostics with the actual transcription fallback", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.transcribe).mockResolvedValue({
      text: "Habari yako?",
      detectedLanguage: "sw",
      model: "whisper-1",
      fallbackUsed: true,
    });

    const result = await translateRecordedAudio(input, gateway);

    expect(result.diagnostics).toEqual({
      transcriptionModel: "whisper-1",
      translationModel: "gpt-5.6-terra",
      transcriptionMs: expect.any(Number),
      translationMs: expect.any(Number),
      totalMs: expect.any(Number),
      transcriptionFallbackUsed: true,
      detectedLanguage: "sw",
    });
    expect(result.diagnostics).not.toHaveProperty("apiKey");
    expect(result.diagnostics).not.toHaveProperty("prompt");
  });

  it.each([
    [{ sourceLanguage: "de", targetLanguage: "sw" }, "Guten Morgen."],
    [{ sourceLanguage: "sw", targetLanguage: "de" }, "Habari za asubuhi."],
  ] as const)("keeps manual %s translation unchanged", async (direction, text) => {
    const gateway = createGateway();
    vi.mocked(gateway.transcribe).mockResolvedValue({
      text,
      detectedLanguage: direction.sourceLanguage,
      model: "gpt-4o-transcribe",
      fallbackUsed: false,
    });

    await translateRecordedAudio({ ...input, direction }, gateway);

    expect(gateway.autoTranslate).not.toHaveBeenCalled();
    expect(gateway.translate).toHaveBeenCalledWith(text, direction);
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

    const autoTranslationFailure = createGateway();
    vi.mocked(autoTranslationFailure.autoTranslate).mockRejectedValue(
      new Error("OpenAI automatic translation request failed"),
    );
    await expect(
      translateRecordedAudio(
        {
          ...input,
          direction: { sourceLanguage: "auto", targetLanguage: "auto" },
        },
        autoTranslationFailure,
      ),
    ).rejects.toMatchObject({ code: "translation_failed" });
  });
});
