import type { TranslatorAudioCaptureMetadata, TranslatorAudioQualityMetrics } from "@/lib/translator/audioQuality";
import { UNAVAILABLE_AUDIO_QUALITY } from "@/lib/translator/audioQuality";
import type { TranslatorConsentSnapshot } from "@/lib/translator/turnConsent";
import type { TranslationLanguage, TranscriptionPath } from "@/lib/translator/types";

export type RecognitionReviewStatus = "unreviewed" | "accepted" | "corrected";

export type TranslatorSpeechQualitySample = {
  sampleId: string | null;
  turnId: string;
  createdAt: string;
  audioFileRef: string | null;
  recognizedTranscript: string;
  recognitionReviewStatus: RecognitionReviewStatus;
  correctedTranscript: string | null;
  transcriptCorrected: boolean;
  correctedTranslation: string | null;
  sourceLanguage: TranslationLanguage | null;
  transcriptionModel: string;
  transcriptionPath: TranscriptionPath;
  fallbackUsed: boolean;
  appVersion: string;
  audioEligible: boolean;
  consentAtRecordingStart: TranslatorConsentSnapshot;
  audioMetadata: TranslatorAudioCaptureMetadata;
  audioQualityMetrics: TranslatorAudioQualityMetrics;
  audioIncludedInDiagnosticBundle: boolean;
  audioSharedRemotely: false;
};

export const KISWAHILI_STT_REGRESSION_CASES = [
  { spoken: "Je", observed: "G / J" },
  { spoken: "kubwa", observed: "kupwa" },
  { spoken: "nzuri", observed: "suri" },
  { spoken: "tafadhali", observed: "tafasali" },
  { spoken: "unaitwa", observed: "una etwa" },
  { spoken: "moja", observed: "moji" },
  { spoken: "mbili", observed: "bili" },
] as const;

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `sample-${Date.now()}`;
}

export function createUnreviewedSpeechQualityRecord(input: {
  turnId: string;
  createdAt?: string;
  recognizedTranscript: string;
  sourceLanguage: TranslationLanguage | null;
  transcriptionModel: string;
  transcriptionPath: TranscriptionPath;
  appVersion: string;
  audioEligible: boolean;
  consentAtRecordingStart: TranslatorConsentSnapshot;
  audioMetadata?: Partial<TranslatorAudioCaptureMetadata>;
  audioQualityMetrics?: TranslatorAudioQualityMetrics;
}): TranslatorSpeechQualitySample {
  return {
    sampleId: null,
    turnId: input.turnId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    audioFileRef: null,
    recognizedTranscript: input.recognizedTranscript,
    recognitionReviewStatus: "unreviewed",
    correctedTranscript: null,
    transcriptCorrected: false,
    correctedTranslation: null,
    sourceLanguage: input.sourceLanguage,
    transcriptionModel: input.transcriptionModel,
    transcriptionPath: input.transcriptionPath,
    fallbackUsed: input.transcriptionPath === "audio_upload_fallback",
    appVersion: input.appVersion,
    audioEligible: input.audioEligible,
    consentAtRecordingStart: input.consentAtRecordingStart,
    audioMetadata: {
      mimeType: input.audioMetadata?.mimeType ?? null,
      sizeBytes: input.audioMetadata?.sizeBytes ?? null,
      durationMs: input.audioMetadata?.durationMs ?? null,
      sampleRate: input.audioMetadata?.sampleRate ?? null,
      channelCount: input.audioMetadata?.channelCount ?? null,
    },
    audioQualityMetrics: input.audioQualityMetrics ?? UNAVAILABLE_AUDIO_QUALITY,
    audioIncludedInDiagnosticBundle: false,
    audioSharedRemotely: false,
  };
}

export function acceptSpeechQualityRecord(
  record: TranslatorSpeechQualitySample,
): TranslatorSpeechQualitySample {
  return {
    ...record,
    sampleId: record.sampleId ?? id(),
    recognitionReviewStatus: "accepted",
    correctedTranscript: null,
    transcriptCorrected: false,
  };
}

export function correctSpeechQualityRecord(
  record: TranslatorSpeechQualitySample,
  correctedTranscript: string,
): TranslatorSpeechQualitySample {
  return {
    ...record,
    sampleId: record.sampleId ?? id(),
    recognitionReviewStatus: "corrected",
    correctedTranscript: correctedTranscript.trim(),
    transcriptCorrected: true,
  };
}

/** Backward-compatible helper used by existing tests and callers. */
export function createSpeechQualitySample(input: {
  turnId: string;
  recognizedTranscript: string;
  correctedTranscript?: string | null;
  sourceLanguage: TranslationLanguage;
  transcriptionModel: string;
  transcriptionPath: TranscriptionPath;
  appVersion: string;
  audio?: { mimeType?: string | null; durationMs?: number | null; sizeBytes?: number | null };
  consentAtRecordingStart?: TranslatorConsentSnapshot;
}): TranslatorSpeechQualitySample {
  const consent = input.consentAtRecordingStart ?? {
    diagnosticsSharingEnabled: false,
    qualityContentSharingEnabled: false,
    speechSampleSharingEnabled: false,
    internalSpeechDiagnosticsEnabled: true,
  };
  const record = createUnreviewedSpeechQualityRecord({
    ...input,
    audioEligible: consent.speechSampleSharingEnabled,
    consentAtRecordingStart: consent,
    audioMetadata: {
      mimeType: input.audio?.mimeType,
      durationMs: input.audio?.durationMs,
      sizeBytes: input.audio?.sizeBytes,
    },
  });
  return input.correctedTranscript
    ? correctSpeechQualityRecord(record, input.correctedTranscript)
    : acceptSpeechQualityRecord(record);
}
