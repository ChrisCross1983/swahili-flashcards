export type RecordedAudioDiagnostics = {
  recordingDurationMs?: number | null;
  chunkCount?: number | null;
  totalChunkBytes?: number | null;
};

export type RecordedAudioValidation =
  | { usable: true }
  | { usable: false; code: "no_audio_captured" | "invalid_audio_capture" };

/** Conservative structural validation only; it never guesses speech content. */
export function isUsableRecordedAudio(
  blob: Pick<Blob, "size" | "type">,
  diagnostics: RecordedAudioDiagnostics = {},
): RecordedAudioValidation {
  if (blob.size === 0) return { usable: false, code: "no_audio_captured" };
  // Valid browser recordings always contain substantially more than a codec
  // header. This catches the observed 5-byte multi-second WebKit artifact.
  if (blob.size < 32) return { usable: false, code: "invalid_audio_capture" };

  const durationMs = diagnostics.recordingDurationMs;
  const chunkCount = diagnostics.chunkCount;
  const totalChunkBytes = diagnostics.totalChunkBytes;
  if (typeof durationMs === "number" && durationMs >= 1_000) {
    if (blob.size < 256 || chunkCount === 0) {
      return { usable: false, code: "invalid_audio_capture" };
    }
    if (durationMs >= 3_000 && blob.size / (durationMs / 1_000) < 64) {
      return { usable: false, code: "invalid_audio_capture" };
    }
  }
  if (
    typeof totalChunkBytes === "number" &&
    totalChunkBytes > 0 &&
    blob.size !== Math.round(totalChunkBytes)
  ) {
    return { usable: false, code: "invalid_audio_capture" };
  }
  return { usable: true };
}
