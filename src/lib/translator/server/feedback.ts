import {
  TRANSLATOR_FEEDBACK_CATEGORIES,
  MAX_TRANSLATOR_FEEDBACK_COMMENT_LENGTH,
  type TranslatorFeedbackCategory,
  type TranslatorFeedbackMode,
  type TranslatorFeedbackRating,
} from "@/lib/translator/feedback";
import { isValidSpeechSpeed } from "@/lib/translator/speechSpeed";

const MAX_TRANSLATION_TEXT_LENGTH = 10_000;
const MAX_MODEL_NAME_LENGTH = 100;
const MAX_DIAGNOSTIC_MS = 3_600_000;
const CATEGORY_VALUES = new Set<string>(
  TRANSLATOR_FEEDBACK_CATEGORIES.map((category) => category.value),
);

type FeedbackDatabasePayload = {
  translation_entry_id: string;
  rating: TranslatorFeedbackRating;
  categories: TranslatorFeedbackCategory[];
  comment: string | null;
  source_language: "de" | "sw";
  target_language: "de" | "sw";
  mode: TranslatorFeedbackMode;
  original_text: string;
  translated_text: string;
  transcription_model: string | null;
  translation_model: string | null;
  tts_model: string | null;
  transcription_ms: number | null;
  translation_ms: number | null;
  auto_translate_ms: number | null;
  total_ms: number | null;
  server_translation_total_ms: number | null;
  translation_request_ms: number | null;
  stop_to_translation_visible_ms: number | null;
  tts_generation_ms: number | null;
  tts_request_to_ready_ms: number | null;
  translation_visible_to_tts_ready_ms: number | null;
  stop_to_tts_ready_ms: number | null;
  stop_to_playback_started_ms: number | null;
  tts_speed: number | null;
  transcription_fallback_used: boolean | null;
  detected_language: "de" | "sw" | null;
  autoplay_enabled: boolean | null;
  autoplay_blocked: boolean | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseLanguage(value: unknown) {
  return value === "de" || value === "sw" ? value : null;
}

function parseMode(value: unknown): TranslatorFeedbackMode | null {
  return value === "auto" || value === "manual" ? value : null;
}

function parseRating(value: unknown): TranslatorFeedbackRating | null {
  return value === "good" || value === "problem" ? value : null;
}

function parseOptionalModel(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const model = value.trim();
  return model && model.length <= MAX_MODEL_NAME_LENGTH ? model : undefined;
}

function parseOptionalDuration(value: unknown) {
  if (value === undefined || value === null) return null;
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_DIAGNOSTIC_MS
    ? Math.round(value)
    : undefined;
}

function parseOptionalBoolean(value: unknown) {
  if (value === undefined || value === null) return null;
  return typeof value === "boolean" ? value : undefined;
}

export function parseTranslatorFeedback(
  body: unknown,
): FeedbackDatabasePayload | null {
  if (!isRecord(body)) return null;
  const translationEntryId =
    typeof body.translationEntryId === "string"
      ? body.translationEntryId.trim()
      : "";
  const rating = parseRating(body.rating);
  const sourceLanguage = parseLanguage(body.sourceLanguage);
  const targetLanguage = parseLanguage(body.targetLanguage);
  const mode = parseMode(body.mode);
  const originalText =
    typeof body.originalText === "string" ? body.originalText.trim() : "";
  const translatedText =
    typeof body.translatedText === "string" ? body.translatedText.trim() : "";
  const comment = typeof body.comment === "string" ? body.comment.trim() : null;

  if (
    !translationEntryId ||
    translationEntryId.length > 128 ||
    !rating ||
    !sourceLanguage ||
    !targetLanguage ||
    sourceLanguage === targetLanguage ||
    !mode ||
    !originalText ||
    !translatedText ||
    originalText.length > MAX_TRANSLATION_TEXT_LENGTH ||
    translatedText.length > MAX_TRANSLATION_TEXT_LENGTH ||
    (comment?.length ?? 0) > MAX_TRANSLATOR_FEEDBACK_COMMENT_LENGTH ||
    !Array.isArray(body.categories)
  ) {
    return null;
  }

  const categories = Array.from(new Set(body.categories));
  if (
    categories.length > TRANSLATOR_FEEDBACK_CATEGORIES.length ||
    categories.some(
      (category) => typeof category !== "string" || !CATEGORY_VALUES.has(category),
    )
  ) {
    return null;
  }

  const diagnostics = body.diagnostics;
  if (diagnostics !== null && diagnostics !== undefined && !isRecord(diagnostics)) {
    return null;
  }
  const values = isRecord(diagnostics) ? diagnostics : {};
  const transcriptionModel = parseOptionalModel(values.transcriptionModel);
  const translationModel = parseOptionalModel(values.translationModel);
  const ttsModel = parseOptionalModel(values.ttsModel);
  const transcriptionMs = parseOptionalDuration(values.transcriptionMs);
  const translationMs = parseOptionalDuration(values.translationMs);
  const autoTranslateMs = parseOptionalDuration(values.autoTranslateMs);
  const totalMs = parseOptionalDuration(values.totalMs);
  const serverTranslationTotalMs = parseOptionalDuration(
    values.serverTranslationTotalMs,
  );
  const translationRequestMs = parseOptionalDuration(
    values.translationRequestMs,
  );
  const stopToTranslationVisibleMs = parseOptionalDuration(
    values.stopToTranslationVisibleMs,
  );
  const ttsGenerationMs = parseOptionalDuration(values.ttsGenerationMs);
  const ttsRequestToReadyMs = parseOptionalDuration(values.ttsRequestToReadyMs);
  const translationVisibleToTtsReadyMs = parseOptionalDuration(
    values.translationVisibleToTtsReadyMs,
  );
  const stopToTtsReadyMs = parseOptionalDuration(values.stopToTtsReadyMs);
  const stopToPlaybackStartedMs = parseOptionalDuration(
    values.stopToPlaybackStartedMs,
  );
  const transcriptionFallbackUsed = parseOptionalBoolean(
    values.transcriptionFallbackUsed,
  );
  const autoplayEnabled = parseOptionalBoolean(values.autoplayEnabled);
  const autoplayBlocked = parseOptionalBoolean(values.autoplayBlocked);
  const detectedLanguage =
    values.detectedLanguage === undefined || values.detectedLanguage === null
      ? null
      : parseLanguage(values.detectedLanguage) ?? undefined;
  const ttsSpeed =
    values.ttsSpeed === undefined || values.ttsSpeed === null
      ? null
      : isValidSpeechSpeed(values.ttsSpeed)
        ? values.ttsSpeed
        : undefined;

  if (
    transcriptionModel === undefined ||
    translationModel === undefined ||
    ttsModel === undefined ||
    transcriptionMs === undefined ||
    translationMs === undefined ||
    autoTranslateMs === undefined ||
    totalMs === undefined ||
    serverTranslationTotalMs === undefined ||
    translationRequestMs === undefined ||
    stopToTranslationVisibleMs === undefined ||
    ttsGenerationMs === undefined ||
    ttsRequestToReadyMs === undefined ||
    translationVisibleToTtsReadyMs === undefined ||
    stopToTtsReadyMs === undefined ||
    stopToPlaybackStartedMs === undefined ||
    transcriptionFallbackUsed === undefined ||
    detectedLanguage === undefined ||
    autoplayEnabled === undefined ||
    autoplayBlocked === undefined ||
    ttsSpeed === undefined
  ) {
    return null;
  }
  if (
    (mode === "auto" && translationMs !== null) ||
    (mode === "manual" && autoTranslateMs !== null)
  ) {
    return null;
  }

  return {
    translation_entry_id: translationEntryId,
    rating,
    categories:
      rating === "problem"
        ? (categories as TranslatorFeedbackCategory[])
        : [],
    comment: comment || null,
    source_language: sourceLanguage,
    target_language: targetLanguage,
    mode,
    original_text: originalText,
    translated_text: translatedText,
    transcription_model: transcriptionModel,
    translation_model: translationModel,
    tts_model: ttsModel,
    transcription_ms: transcriptionMs,
    translation_ms: translationMs,
    auto_translate_ms: autoTranslateMs,
    total_ms: totalMs ?? serverTranslationTotalMs,
    server_translation_total_ms: serverTranslationTotalMs ?? totalMs,
    translation_request_ms: translationRequestMs,
    stop_to_translation_visible_ms: stopToTranslationVisibleMs,
    tts_generation_ms: ttsGenerationMs,
    tts_request_to_ready_ms: ttsRequestToReadyMs,
    translation_visible_to_tts_ready_ms: translationVisibleToTtsReadyMs,
    stop_to_tts_ready_ms: stopToTtsReadyMs,
    stop_to_playback_started_ms: stopToPlaybackStartedMs,
    tts_speed: ttsSpeed,
    transcription_fallback_used: transcriptionFallbackUsed,
    detected_language: detectedLanguage,
    autoplay_enabled: autoplayEnabled,
    autoplay_blocked: autoplayBlocked,
  };
}
