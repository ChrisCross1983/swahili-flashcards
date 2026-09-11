import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import TurnFeedbackSheet, { createSavedTurnFeedback } from "@/components/translator/TurnFeedbackSheet";
import type { TranslationEntry } from "@/lib/translator/types";

const entry: TranslationEntry = {
  id: "turn-1", timestamp: Date.now(), sourceLanguage: "sw", targetLanguage: "de",
  originalText: "Una etwa nani?", translatedText: "Wie heißt du?", sourceWasDetected: false,
  diagnostics: {
    transcriptionModel: "gpt-live-transcribe", translationModel: "gpt-5.6-terra",
    transcriptionMs: 1, translationMs: 1, serverTranslationTotalMs: 2,
    transcriptionFallbackUsed: false, detectedLanguage: "sw",
  },
};

describe("unified per-turn feedback", () => {
  it("renders one calm, tappable feedback chooser for every successful turn", () => {
    const html = renderToStaticMarkup(<TurnFeedbackSheet entry={entry} open onClose={vi.fn()} onCaptured={vi.fn()} onSaved={vi.fn()} />);
    expect(html).toContain("Was möchtest du rückmelden?");
    expect(html).toContain("Alles richtig");
    expect(html).toContain("Gesprochenes falsch erkannt");
    expect(html).toContain("Übersetzung stimmt nicht");
    expect(html).toContain("Vorlesen stimmt nicht");
    expect(html).toContain("min-h-12");
    expect(html).not.toContain("overflow-x");
  });

  it("marks everything correct without inventing positive TTS feedback", () => {
    expect(createSavedTurnFeedback({ type: "all_correct", ttsWasActuallyUsed: false })).toMatchObject({
      speechFeedbackStatus: "accepted", translationFeedback: "positive", ttsFeedback: null,
    });
    expect(createSavedTurnFeedback({ type: "all_correct", ttsWasActuallyUsed: true }).ttsFeedback).toBe("positive");
  });

  it("keeps speech, translation and TTS negative feedback separate", () => {
    expect(createSavedTurnFeedback({ type: "speech_recognition", correctedTranscript: "Unaitwa nani?", ttsWasActuallyUsed: false })).toMatchObject({
      speechFeedbackStatus: "corrected", correctedTranscript: "Unaitwa nani?",
      translationFeedback: null, ttsFeedback: null,
    });
    expect(createSavedTurnFeedback({ type: "translation", ttsWasActuallyUsed: false })).toMatchObject({
      speechFeedbackStatus: null, translationFeedback: "negative", ttsFeedback: null,
    });
    expect(createSavedTurnFeedback({ type: "tts", ttsWasActuallyUsed: true })).toMatchObject({
      speechFeedbackStatus: null, translationFeedback: null, ttsFeedback: "negative",
    });
  });

  it("captures locally before remote persistence and preserves schema-failure state", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/translator/TurnFeedbackSheet.tsx"), "utf8");
    expect(source.indexOf("onCaptured(entry.id, local)")).toBeLessThan(
      source.indexOf("await submitTranslatorFeedback"),
    );
    expect(source).toContain('persistenceStatus: "sync_failed"');
    expect(source).toContain("Rückmeldung lokal gespeichert. Serverspeicherung noch nicht verfügbar.");
  });
});
