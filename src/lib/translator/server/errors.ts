export type TranslatorPipelineErrorCode =
  | "configuration"
  | "no_speech"
  | "unsupported_language"
  | "transcription_failed"
  | "translation_failed"
  | "speech_failed";

export class TranslatorPipelineError extends Error {
  readonly code: TranslatorPipelineErrorCode;

  constructor(code: TranslatorPipelineErrorCode, message: string) {
    super(message);
    this.name = "TranslatorPipelineError";
    this.code = code;
  }
}

const PIPELINE_ERROR_CODES = new Set<TranslatorPipelineErrorCode>([
  "configuration",
  "no_speech",
  "unsupported_language",
  "transcription_failed",
  "translation_failed",
  "speech_failed",
]);

export function getTranslatorPipelineErrorCode(
  error: unknown,
): TranslatorPipelineErrorCode | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = String(error.code) as TranslatorPipelineErrorCode;
  return PIPELINE_ERROR_CODES.has(code) ? code : null;
}
