import { describe, expect, it, vi } from "vitest";
import {
  createTranslationEntry,
  requestAudioTranslation,
} from "@/lib/translator/client";
import {
  initialTranslatorState,
  translatorReducer,
} from "@/lib/translator/stateMachine";

const direction = { sourceLanguage: "sw", targetLanguage: "de" } as const;
const result = {
  originalText: "Tutakuja kesho asubuhi.",
  translatedText: "Wir kommen morgen früh.",
  ...direction,
  diagnostics: {
    transcriptionModel: "gpt-4o-mini-transcribe",
    translationModel: "gpt-5.6-terra",
    transcriptionMs: 1200,
    translationMs: 800,
    totalMs: 2000,
    transcriptionFallbackUsed: false,
    detectedLanguage: "sw" as const,
  },
};

describe("translator client", () => {
  it("sends the recorded file and uses the real API response", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const formData = init?.body as FormData;
      const audio = formData.get("audio") as File;
      expect(audio.name).toBe("recording.webm");
      expect(audio.type).toBe("audio/webm;codecs=opus");
      expect(formData.get("sourceLanguage")).toBe("sw");
      expect(formData.get("targetLanguage")).toBe("de");
      return Response.json(result);
    });

    await expect(
      requestAudioTranslation(
        new Blob(["audio"], { type: "audio/webm;codecs=opus" }),
        direction,
        { fetcher },
      ),
    ).resolves.toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("creates a TranslationEntry and stores it through the processing transition", () => {
    const entry = createTranslationEntry(result, {
      timestamp: 123,
      id: "translation-123",
    });
    const processing = {
      ...initialTranslatorState,
      status: "processing" as const,
    };
    const complete = translatorReducer(processing, {
      type: "PROCESSING_SUCCEEDED",
      entry,
    });

    expect(complete.status).toBe("idle");
    expect(complete.entries).toEqual([entry]);
    expect(entry.diagnostics).toMatchObject({
      transcriptionModel: "gpt-4o-mini-transcribe",
      translationModel: "gpt-5.6-terra",
      transcriptionFallbackUsed: false,
    });
  });

  it("accepts a concrete detected direction for an AUTO request", async () => {
    const autoResult = {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        translationMs: undefined,
        autoTranslateMs: 800,
      },
    };
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const formData = init?.body as FormData;
      expect(formData.get("sourceLanguage")).toBe("auto");
      expect(formData.get("targetLanguage")).toBe("auto");
      return Response.json(autoResult);
    });

    await expect(
      requestAudioTranslation(
        new Blob(["audio"], { type: "audio/webm" }),
        { sourceLanguage: "auto", targetLanguage: "auto" },
        { fetcher },
      ),
    ).resolves.toMatchObject({
      sourceLanguage: "sw",
      targetLanguage: "de",
      diagnostics: {
        autoTranslateMs: 800,
      },
    });
  });

  it("maps API failures to the translator error state", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { code: "transcription_failed", error: "internal detail" },
        { status: 502 },
      ),
    );

    await expect(
      requestAudioTranslation(
        new Blob(["audio"], { type: "audio/webm" }),
        direction,
        { fetcher },
      ),
    ).rejects.toThrow("Die Aufnahme konnte nicht verarbeitet werden.");

    const processing = {
      ...initialTranslatorState,
      status: "processing" as const,
    };
    expect(
      translatorReducer(processing, {
        type: "PROCESSING_FAILED",
        message: "Die Aufnahme konnte nicht verarbeitet werden.",
      }),
    ).toMatchObject({ status: "error" });
  });
});
