import { describe, expect, it, vi } from "vitest";
import { submitTranslatorFeedback } from "@/lib/translator/feedbackClient";
import type { TranslationEntry } from "@/lib/translator/types";

const entry: TranslationEntry = {
  id: "translation-1",
  timestamp: 1_700_000_000_000,
  sourceLanguage: "de",
  targetLanguage: "sw",
  originalText: "Wie geht es dir?",
  translatedText: "Habari yako?",
  sourceWasDetected: true,
  diagnostics: {
    transcriptionModel: "gpt-4o-mini-transcribe",
    translationModel: "gpt-5.6-terra",
    transcriptionMs: 1000,
    autoTranslateMs: 700,
    totalMs: 1700,
    transcriptionFallbackUsed: false,
    detectedLanguage: "de",
    ttsModel: "gpt-4o-mini-tts",
    ttsGenerationMs: 400,
    ttsSpeed: 1.1,
    autoplayEnabled: true,
    autoplayBlocked: true,
  },
};

describe("translator feedback client", () => {
  it("submits good feedback with entry diagnostics and no owner field", async () => {
    const fetcher = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(input).toBe("/api/translator/feedback");
        expect(init?.method).toBe("POST");
        return Response.json({ saved: true });
      },
    );

    await submitTranslatorFeedback(
      entry,
      {
        rating: "good",
        categories: [],
        comment: "Sehr natürlich.",
      },
      { fetcher },
    );

    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      translationEntryId: "translation-1",
      rating: "good",
      categories: [],
      comment: "Sehr natürlich.",
      mode: "auto",
      diagnostics: {
        ttsModel: "gpt-4o-mini-tts",
        ttsSpeed: 1.1,
        autoplayBlocked: true,
      },
    });
    expect(body).not.toHaveProperty("owner_key");
    expect(body).not.toHaveProperty("apiKey");
    expect(body).not.toHaveProperty("prompt");
  });

  it("submits multiple problem categories and optional free text", async () => {
    const fetcher = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(input).toBe("/api/translator/feedback");
        expect(init?.method).toBe("POST");
        return Response.json({ saved: true });
      },
    );

    await submitTranslatorFeedback(
      entry,
      {
        rating: "problem",
        categories: ["transcription_wrong", "speech_too_fast"],
        comment: "Ein Wort war falsch.",
      },
      { fetcher },
    );

    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.categories).toEqual([
      "transcription_wrong",
      "speech_too_fast",
    ]);
    expect(body.comment).toBe("Ein Wort war falsch.");
  });
});
