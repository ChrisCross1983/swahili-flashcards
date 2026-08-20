import type {
  TranslationDiagnostics,
  TranslationEntry,
  TranslationLanguage,
} from "@/lib/translator/types";

export const MAX_TRANSLATOR_FEEDBACK_COMMENT_LENGTH = 1_000;

export const TRANSLATOR_FEEDBACK_CATEGORIES = [
  { value: "transcription_wrong", label: "Transkription falsch" },
  { value: "translation_wrong", label: "Übersetzung falsch" },
  { value: "language_wrong", label: "Sprache falsch erkannt" },
  { value: "speech_pronunciation", label: "Sprachausgabe / Aussprache" },
  { value: "speech_too_fast", label: "Sprachausgabe zu schnell" },
  { value: "speech_too_slow", label: "Sprachausgabe zu langsam" },
  { value: "overall_too_slow", label: "Zu langsam insgesamt" },
  { value: "other", label: "Sonstiges" },
] as const;

export type TranslatorFeedbackCategory =
  (typeof TRANSLATOR_FEEDBACK_CATEGORIES)[number]["value"];
export type TranslatorFeedbackRating = "good" | "problem";
export type TranslatorFeedbackMode = "auto" | "manual";

export type TranslatorFeedbackSubmission = {
  translationEntryId: string;
  rating: TranslatorFeedbackRating;
  categories: TranslatorFeedbackCategory[];
  comment: string | null;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  mode: TranslatorFeedbackMode;
  originalText: string;
  translatedText: string;
  diagnostics: TranslationDiagnostics | null;
};

export function createTranslatorFeedbackSubmission(
  entry: TranslationEntry,
  input: {
    rating: TranslatorFeedbackRating;
    categories: TranslatorFeedbackCategory[];
    comment: string;
  },
): TranslatorFeedbackSubmission {
  return {
    translationEntryId: entry.id,
    rating: input.rating,
    categories: input.rating === "problem" ? input.categories : [],
    comment: input.comment.trim() || null,
    sourceLanguage: entry.sourceLanguage,
    targetLanguage: entry.targetLanguage,
    mode: entry.sourceWasDetected ? "auto" : "manual",
    originalText: entry.originalText,
    translatedText: entry.translatedText,
    diagnostics: entry.diagnostics ?? null,
  };
}
