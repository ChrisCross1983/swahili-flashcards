import { describe, expect, it, vi } from "vitest";
import { requestClassicTranslation } from "@/lib/translator/classicTranslationPipeline";
import type { TranslationResult } from "@/lib/translator/types";

const direction = { sourceLanguage: "auto", targetLanguage: "auto" } as const;
const result = {
  originalText: "Habari yako?",
  translatedText: "Wie geht es dir?",
  sourceLanguage: "sw",
  targetLanguage: "de",
  diagnostics: {
    transcriptionModel: "gpt-live-transcribe",
    translationModel: "gpt-5.6-terra",
    transcriptionMs: 900,
    autoTranslateMs: 300,
    serverTranslationTotalMs: 310,
    transcriptionFallbackUsed: false,
    detectedLanguage: "sw",
  },
} satisfies TranslationResult;

describe("classic post-stop translation path", () => {
  it("uses realtime text and skips audio upload STT in the normal path", async () => {
    const requestText = vi.fn(async () => result);
    const requestAudio = vi.fn(async () => result);
    const getAudioBlob = vi.fn(async () => new Blob(["audio"]));

    await expect(
      requestClassicTranslation(
        {
          realtimeResult: {
            ok: true,
            authoritativeTranscript: "Habari yako?",
          },
          transcriptionMs: 900,
          getAudioBlob,
          direction,
          signal: new AbortController().signal,
        },
        { requestText, requestAudio },
      ),
    ).resolves.toBe(result);

    expect(requestText).toHaveBeenCalledOnce();
    expect(requestAudio).not.toHaveBeenCalled();
    expect(getAudioBlob).not.toHaveBeenCalled();
  });

  it.each([
    "connection_failure",
    "connection_timeout",
    "realtime_not_ready_at_recording_start",
    "connection_lost_during_recording",
    "empty_transcript",
    "transcript_not_finalized",
    "session_error",
    "transcript_timeout",
    "timeout",
  ] as const)("uses the preserved audio upload fallback for %s", async (fallbackReason) => {
    const fallbackResult = {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        transcriptionModel: "gpt-4o-mini-transcribe",
      },
    };
    const requestText = vi.fn(async () => result);
    const requestAudio = vi.fn(async () => fallbackResult);
    const audioBlob = new Blob(["audio"], { type: "audio/webm" });
    const getAudioBlob = vi.fn(async () => audioBlob);

    await expect(
      requestClassicTranslation(
        {
          realtimeResult: { ok: false, fallbackReason },
          transcriptionMs: undefined,
          getAudioBlob,
          direction,
          signal: new AbortController().signal,
        },
        { requestText, requestAudio },
      ),
    ).resolves.toBe(fallbackResult);

    expect(requestText).not.toHaveBeenCalled();
    expect(getAudioBlob).toHaveBeenCalledOnce();
    expect(requestAudio).toHaveBeenCalledOnce();
    expect(requestAudio).toHaveBeenCalledWith(
      audioBlob,
      direction,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
