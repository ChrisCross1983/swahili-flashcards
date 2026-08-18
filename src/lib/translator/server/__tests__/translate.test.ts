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
    transcribe: vi.fn(async () => " Tutakuja kesho asubuhi. "),
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
        return " Tutakuja kesho asubuhi. ";
      }),
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
  });

  it("does not translate an empty or content-free transcript", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.transcribe).mockResolvedValue(" ... ");

    await expect(translateRecordedAudio(input, gateway)).rejects.toMatchObject({
      code: "no_speech",
    } satisfies Partial<TranslatorPipelineError>);
    expect(gateway.translate).not.toHaveBeenCalled();
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
