export type TranslationLanguage = "de" | "sw";

export type TranslationDirection = {
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
};

export type TranslationEntry = {
  id: string;
  timestamp: number;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  originalText: string;
  translatedText: string;
};

export type TranslationResult = {
  originalText: string;
  translatedText: string;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
};

export type TranslatorApiErrorCode =
  | "invalid_request"
  | "invalid_direction"
  | "invalid_audio_format"
  | "audio_too_large"
  | "no_speech"
  | "transcription_failed"
  | "translation_failed"
  | "service_unavailable";

export type TranslatorStatus =
  | "idle"
  | "recording"
  | "processing"
  | "playing"
  | "error";
