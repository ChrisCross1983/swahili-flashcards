export type TranslatorPipelineErrorCode =
  | "configuration"
  | "no_speech"
  | "unsupported_language"
  | "stt_transcript_implausible"
  | "transcription_failed"
  | "translation_failed"
  | "speech_failed";

export class TranslatorPipelineError extends Error {
  readonly code: TranslatorPipelineErrorCode;
  readonly recognizedTranscript: string | null;
  readonly transcriptAnomaly: import("@/lib/translator/transcriptAnomaly").TranscriptAnomalyMetrics | null;

  constructor(
    code: TranslatorPipelineErrorCode,
    message: string,
    recognizedTranscript: string | null = null,
    transcriptAnomaly: import("@/lib/translator/transcriptAnomaly").TranscriptAnomalyMetrics | null = null,
  ) {
    super(message);
    this.name = "TranslatorPipelineError";
    this.code = code;
    this.recognizedTranscript = recognizedTranscript;
    this.transcriptAnomaly = transcriptAnomaly;
  }
}

const PIPELINE_ERROR_CODES = new Set<TranslatorPipelineErrorCode>([
  "configuration",
  "no_speech",
  "unsupported_language",
  "stt_transcript_implausible",
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
