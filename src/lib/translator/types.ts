export type TranslationLanguage = "de" | "sw";

export type TranslationMode = "auto" | "de-to-sw" | "sw-to-de";

export type TranslationDirection = {
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
};

export type TranslationRequestDirection =
  | TranslationDirection
  | { sourceLanguage: "auto"; targetLanguage: "auto" };

export type TranslationDiagnostics = {
  transcriptionModel: string;
  translationModel: string;
  transcriptionMs: number;
  translationMs?: number;
  autoTranslateMs?: number;
  totalMs: number;
  transcriptionFallbackUsed: boolean;
  detectedLanguage: TranslationLanguage | null;
  ttsModel?: string;
  ttsGenerationMs?: number;
  ttsSpeed?: number;
  autoplayEnabled?: boolean;
  autoplayBlocked?: boolean;
};

export type TranslationEntry = {
  id: string;
  timestamp: number;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  originalText: string;
  translatedText: string;
  sourceWasDetected: boolean;
  diagnostics?: TranslationDiagnostics;
};

export type TranslationResult = {
  originalText: string;
  translatedText: string;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  diagnostics: TranslationDiagnostics;
};

export type TranslatorApiErrorCode =
  | "invalid_request"
  | "invalid_direction"
  | "invalid_audio_format"
  | "audio_too_large"
  | "no_speech"
  | "unsupported_language"
  | "transcription_failed"
  | "translation_failed"
  | "service_unavailable";

export type TranslatorStatus =
  | "idle"
  | "recording"
  | "processing"
  | "playing"
  | "paused"
  | "error";
