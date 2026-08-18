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

export type TranslatorStatus =
  | "idle"
  | "recording"
  | "processing"
  | "playing"
  | "error";
