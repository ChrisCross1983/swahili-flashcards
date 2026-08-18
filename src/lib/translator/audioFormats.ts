export const MAX_TRANSLATION_AUDIO_BYTES = 25 * 1024 * 1024;

const SUPPORTED_AUDIO_FORMATS = {
  "audio/mpeg": { extension: "mp3", mimeType: "audio/mpeg" },
  "audio/mp3": { extension: "mp3", mimeType: "audio/mpeg" },
  "audio/mpga": { extension: "mpga", mimeType: "audio/mpeg" },
  "audio/mp4": { extension: "mp4", mimeType: "audio/mp4" },
  "audio/m4a": { extension: "m4a", mimeType: "audio/mp4" },
  "audio/x-m4a": { extension: "m4a", mimeType: "audio/mp4" },
  "audio/wav": { extension: "wav", mimeType: "audio/wav" },
  "audio/wave": { extension: "wav", mimeType: "audio/wav" },
  "audio/x-wav": { extension: "wav", mimeType: "audio/wav" },
  "audio/webm": { extension: "webm", mimeType: "audio/webm" },
} as const;

export type SupportedAudioFormat = {
  extension: "mp3" | "mpga" | "mp4" | "m4a" | "wav" | "webm";
  mimeType: string;
};

export function normalizeAudioMimeType(mimeType: string) {
  return mimeType.toLowerCase().split(";", 1)[0].trim();
}

export function getSupportedAudioFormat(
  mimeType: string,
): SupportedAudioFormat | null {
  const normalized = normalizeAudioMimeType(mimeType);
  return (
    SUPPORTED_AUDIO_FORMATS[
      normalized as keyof typeof SUPPORTED_AUDIO_FORMATS
    ] ?? null
  );
}
