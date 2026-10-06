import { describe, expect, it, vi } from "vitest";
import { RealtimeSpeechOutputPlayer } from "@/lib/translator/realtimeSpeechOutputPlayer";
import { ClassicRealtimeSpeechOutputClient } from "@/lib/translator/realtimeSpeechOutputClient";
import type { TranslatorSpeechPlaybackOptions } from "@/lib/translator/translatorSpeechPlayer";
import type { TranslationEntry } from "@/lib/translator/types";

const entry = {
  id: "turn-1", timestamp: 1, sourceLanguage: "de" as const, targetLanguage: "sw" as const,
  originalText: "Hallo", translatedText: "Habari", sourceWasDetected: false,
};

describe("RealtimeSpeechOutputPlayer", () => {
  it("automatically uses legacy autoplay when realtime fails before playback", async () => {
    const render = vi.fn(async () => {
      throw new Error("realtime_speech_sdp_failed");
    });
    const playLegacy = vi.fn(async (
      _entry: TranslationEntry,
      _speed: number,
      options: TranslatorSpeechPlaybackOptions,
    ) => {
      options.onPlaybackStarted?.();
    });
    const player = new RealtimeSpeechOutputPlayer({
      client: { render, stop: vi.fn() } as never,
      playLegacy,
    });
    const diagnostics = vi.fn();
    const onPlaybackStarted = vi.fn();

    await player.play(entry, 1, {
      autoplay: true,
      onSpeechDiagnosticsUpdated: diagnostics,
      onPlaybackStarted,
    });

    expect(playLegacy).toHaveBeenCalledOnce();
    expect(playLegacy).toHaveBeenCalledWith(entry, 1, expect.objectContaining({ autoplay: true }));
    expect(onPlaybackStarted).toHaveBeenCalledOnce();
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      ttsRealtimeFallbackUsed: true,
      ttsRealtimeFallbackReason: "realtime_speech_sdp_failed",
    }));
  });

  it("starts legacy fallback on an immediate session error without waiting for setup timeout", async () => {
    vi.useFakeTimers();
    try {
      const client = new ClassicRealtimeSpeechOutputClient({
        fetcher: vi.fn(async () => {
          throw new TypeError("session_fetch_failed");
        }),
      });
      const playLegacy = vi.fn(async () => undefined);
      const player = new RealtimeSpeechOutputPlayer({ client, playLegacy });
      const diagnostics = vi.fn();

      await player.play(entry, 1, {
        autoplay: true,
        onSpeechDiagnosticsUpdated: diagnostics,
      });

      expect(playLegacy).toHaveBeenCalledOnce();
      expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
        ttsRealtimeFallbackUsed: true,
        ttsRealtimeFallbackReason: "session_fetch_failed",
        ttsRealtimeFallbackStartedAt: expect.any(String),
      }));
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not start legacy fallback after remote playback has started", async () => {
    const render = vi.fn(async (_text, _language, _signal, handlers) => {
      handlers.onPlaybackStarted();
      throw new Error("late_realtime_error");
    });
    const playLegacy = vi.fn(async () => undefined);
    const player = new RealtimeSpeechOutputPlayer({
      client: { render, stop: vi.fn() } as never,
      playLegacy,
    });

    await expect(player.play(entry, 1)).rejects.toThrow("late_realtime_error");
    expect(playLegacy).not.toHaveBeenCalled();
  });

  it("forwards only the final translated Terra text", async () => {
    const render = vi.fn(async () => undefined);
    const player = new RealtimeSpeechOutputPlayer({
      client: { render, stop: vi.fn() } as never,
      playLegacy: vi.fn(async () => undefined),
    });

    await player.play(entry, 1);
    expect(render).toHaveBeenCalledWith("Habari", "sw", expect.any(AbortSignal), expect.any(Object));
  });
});
