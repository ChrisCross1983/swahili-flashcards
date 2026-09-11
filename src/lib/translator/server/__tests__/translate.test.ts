import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslatorPipelineError } from "@/lib/translator/server/errors";
import {
  transcribeRecordedAudio,
  translateRecordedAudio,
  translateAuthoritativeText,
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
      model: "gpt-4o-mini-transcribe",
      fallbackUsed: false,
    })),
    autoTranslate: vi.fn(async () => ({
      sourceLanguage: "sw" as const,
      targetLanguage: "de" as const,
      translatedText: "Wir kommen morgen früh.",
    })),
    translate: vi.fn(async () => " Wir kommen morgen früh. "),
    translateWithSummary: vi.fn(async () => ({
      translatedText: "Wir kommen morgen früh.",
      essenceSummary: null,
    })),
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
          model: "gpt-4o-mini-transcribe",
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

  it("translates an authoritative transcript through the same Terra gateway without audio STT", async () => {
    const gateway = createGateway();

    const result = await translateAuthoritativeText(
      {
        authoritativeTranscript: " Tutakuja kesho asubuhi. ",
        direction: input.direction,
        transcriptionModel: "gpt-live-transcribe",
        transcriptionMs: 1850,
      },
      gateway,
    );

    expect(gateway.transcribe).not.toHaveBeenCalled();
    expect(gateway.translate).toHaveBeenCalledOnce();
    expect(gateway.translate).toHaveBeenCalledWith(
      "Tutakuja kesho asubuhi.",
      input.direction,
    );
    expect(result).toMatchObject({
      originalText: "Tutakuja kesho asubuhi.",
      translatedText: "Wir kommen morgen früh.",
      diagnostics: {
        transcriptionModel: "gpt-live-transcribe",
        transcriptionMs: 1850,
        translationModel: "gpt-5.6-terra",
      },
    });
  });

  it("keeps AUTO detection and translation combined in one Terra request for realtime text", async () => {
    const gateway = createGateway();

    await translateAuthoritativeText(
      {
        authoritativeTranscript: "Habari yako?",
        direction: { sourceLanguage: "auto", targetLanguage: "auto" },
        transcriptionModel: "gpt-live-transcribe",
        transcriptionMs: 900,
      },
      gateway,
    );

    expect(gateway.transcribe).not.toHaveBeenCalled();
    expect(gateway.autoTranslate).toHaveBeenCalledOnce();
    expect(gateway.autoTranslate).toHaveBeenCalledWith("Habari yako?");
    expect(gateway.translate).not.toHaveBeenCalled();
  });

  it("does not translate an empty or content-free transcript", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.transcribe).mockResolvedValue({
      text: " ... ",
      detectedLanguage: "sw",
      model: "gpt-4o-mini-transcribe",
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
        model: "gpt-4o-mini-transcribe",
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
      model: "gpt-4o-mini-transcribe",
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
      "[translator][turn performance][server]",
      expect.objectContaining({
        transcriptionMs: expect.any(Number),
        autoTranslateMs: expect.any(Number),
        serverTranslationTotalMs: expect.any(Number),
      }),
    );
    const timing = infoSpy.mock.calls.find(
      ([message]) =>
        message === "[translator][turn performance][server]",
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
      serverTranslationTotalMs: expect.any(Number),
      transcriptionFallbackUsed: true,
      detectedLanguage: "sw",
      transcriptFinalAt: expect.any(String),
      translationStartedAt: expect.any(String),
      translationReadyAt: expect.any(String),
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
      model: "gpt-4o-mini-transcribe",
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
    ).rejects.toMatchObject({
      code: "translation_failed",
      recognizedTranscript: "Tutakuja kesho asubuhi.",
    });

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

  it("returns full translation and essence in one Terra call for a long turn", async () => {
    const gateway = createGateway();
    const longText = Array.from({ length: 50 }, (_, index) =>
      index === 0 ? "Nahitaji" : "maelezo").join(" ");
    vi.mocked(gateway.translateWithSummary!).mockResolvedValue({
      translatedText: "Dies ist die vollständige, nicht gekürzte Übersetzung mit allen wiederholten Einzelheiten und wichtigen Nebeninformationen aus der Aussage.",
      essenceSummary: "Er braucht eine kurze Klärung.",
    });

    const result = await translateAuthoritativeText({
      authoritativeTranscript: longText,
      direction: input.direction,
      transcriptionModel: "gpt-live-transcribe",
      transcriptionMs: 1_000,
    }, gateway);

    expect(gateway.translateWithSummary).toHaveBeenCalledOnce();
    expect(gateway.translateWithSummary).toHaveBeenCalledWith(
      longText,
      input.direction,
    );
    expect(gateway.translate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      translatedText: "Dies ist die vollständige, nicht gekürzte Übersetzung mit allen wiederholten Einzelheiten und wichtigen Nebeninformationen aus der Aussage.",
      essenceSummary: "Er braucht eine kurze Klärung.",
      diagnostics: {
        summaryEligible: true,
        summaryGenerated: true,
        summaryGenerationOutcome: "success",
      },
    });
  });

  it("keeps a valid full translation when an eligible summary is missing", async () => {
    const gateway = createGateway();
    const longText = Array.from({ length: 50 }, () => "maelezo").join(" ");
    vi.mocked(gateway.translateWithSummary!).mockResolvedValue({
      translatedText: "Vollständige Übersetzung.",
    });
    const result = await translateAuthoritativeText({
      authoritativeTranscript: longText,
      direction: input.direction,
      transcriptionModel: "gpt-live-transcribe",
      transcriptionMs: 1_000,
    }, gateway);
    expect(result.translatedText).toBe("Vollständige Übersetzung.");
    expect(result.essenceSummary).toBeUndefined();
    expect(result.diagnostics).toMatchObject({
      summaryGenerated: false,
      summaryGenerationOutcome: "missing",
    });
  });

  it("keeps translation when Terra reports no coherent essence", async () => {
    const gateway = createGateway();
    const longText = Array.from({ length: 50 }, (_, index) =>
      `phrase-${index}`).join(" ");
    vi.mocked(gateway.translateWithSummary!).mockResolvedValue({
      translatedText: "Hallo. Eins. Essen. Gute Nacht. Verschiedene Testphrasen.",
      essenceSummary: null,
    });
    const result = await translateAuthoritativeText({
      authoritativeTranscript: longText,
      direction: input.direction,
      transcriptionModel: "gpt-live-transcribe",
      transcriptionMs: 1_000,
    }, gateway);
    expect(result.essenceSummary).toBeUndefined();
    expect(result.diagnostics.summaryGenerationOutcome).toBe("not_meaningful");
  });

  it("runs benchmark audio transcription without invoking translation", async () => {
    const gateway = createGateway();
    await expect(transcribeRecordedAudio(input, gateway)).resolves.toMatchObject({
      transcript: "Tutakuja kesho asubuhi.",
      model: "gpt-4o-mini-transcribe",
      fallbackUsed: false,
    });
    expect(gateway.transcribe).toHaveBeenCalledOnce();
    expect(gateway.translate).not.toHaveBeenCalled();
    expect(gateway.translateWithSummary).not.toHaveBeenCalled();
    expect(gateway.autoTranslate).not.toHaveBeenCalled();
  });

  it("uses identical safe-STT input for product fallback and the secondary benchmark", async () => {
    const gateway = createGateway();
    const fallbackInput = {
      ...input,
      direction: { sourceLanguage: "auto", targetLanguage: "auto" } as const,
    };

    await translateRecordedAudio(fallbackInput, gateway);
    await transcribeRecordedAudio(fallbackInput, gateway);

    const transcribe = vi.mocked(gateway.transcribe);
    expect(transcribe).toHaveBeenCalledTimes(2);
    const normalizedCalls = transcribe.mock.calls.map(([value]) => ({
      ...value,
      bytes: Array.from(value.bytes),
    }));
    expect(normalizedCalls[1]).toEqual(normalizedCalls[0]);
    expect(normalizedCalls[0]).toMatchObject({
      language: null,
      fileName: "recording.webm",
      normalizedMimeType: "audio/webm",
    });
  });

  it("drops only an insufficiently compressed essence", async () => {
    const gateway = createGateway();
    const longText = Array.from({ length: 50 }, () => "maelezo").join(" ");
    const translation = "Er erklärt ausführlich, dass er für seine Familie eine Wohnung mit zwei Zimmern benötigt und diese Größe für alle ausreichen würde.";
    vi.mocked(gateway.translateWithSummary!).mockResolvedValue({
      translatedText: translation,
      essenceSummary: "Er erklärt, dass er für seine Familie eine Wohnung mit zwei Zimmern benötigt und diese Größe für alle ausreichen würde.",
    });
    const result = await translateAuthoritativeText({
      authoritativeTranscript: longText,
      direction: input.direction,
      transcriptionModel: "gpt-live-transcribe",
      transcriptionMs: 1_000,
    }, gateway);
    expect(result.translatedText).toBe(translation);
    expect(result.essenceSummary).toBeUndefined();
    expect(result.diagnostics.summaryGenerationOutcome).toBe(
      "insufficient_compression",
    );
  });
});
