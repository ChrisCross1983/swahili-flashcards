import { describe, expect, it, vi } from "vitest";
import { RealtimeSpeechOutputPlayer } from "@/lib/translator/realtimeSpeechOutputPlayer";

const entry = {
  id: "turn-1", timestamp: 1, sourceLanguage: "de" as const, targetLanguage: "sw" as const,
  originalText: "Hallo", translatedText: "Habari", sourceWasDetected: false,
};

describe("RealtimeSpeechOutputPlayer", () => {
  it("uses the legacy player only when realtime fails before playback", async () => {
    const render = vi.fn(async () => {
      throw new Error("realtime_speech_sdp_failed");
    });
    const playLegacy = vi.fn(async () => undefined);
    const player = new RealtimeSpeechOutputPlayer({
      client: { render, stop: vi.fn() } as never,
      playLegacy,
    });
    const diagnostics = vi.fn();

    await player.play(entry, 1, { onSpeechDiagnosticsUpdated: diagnostics });

    expect(playLegacy).toHaveBeenCalledOnce();
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      ttsRealtimeFallbackUsed: true,
      ttsRealtimeFallbackReason: "realtime_speech_sdp_failed",
    }));
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
