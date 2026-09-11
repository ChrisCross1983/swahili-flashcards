import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("react");
  vi.doUnmock("@/lib/translator/speechClient");
  vi.doUnmock("@/lib/translator/translatorSpeechPlayer");
  vi.resetModules();
});

describe("useTranslatorSpeech lifecycle", () => {
  it("disposes playback resources when the translator unmounts", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/translator/useTranslatorSpeech.ts"),
      "utf8",
    );

    expect(source).toContain("playerRef.current?.dispose()");
  });

  it("synthesizes only the full translated text, never the essence", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/translator/useTranslatorSpeech.ts"),
      "utf8",
    );
    expect(source).toContain("requestTranslatorSpeech(entry.translatedText");
    expect(source).not.toContain("entry.essenceSummary");
  });

  it("recreates the disposed player during the Strict Mode setup-cleanup-setup cycle", async () => {
    const players: Array<{
      dispose: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
    }> = [];
    const playerRef = { current: null as null | (typeof players)[number] };
    vi.doMock("react", () => ({
      useRef: () => playerRef,
      useCallback: <T,>(callback: T) => callback,
      useEffect: (setup: () => void | (() => void)) => {
        const cleanup = setup();
        cleanup?.();
        setup();
      },
    }));
    vi.doMock("@/lib/translator/speechClient", () => ({
      requestTranslatorSpeech: vi.fn(),
    }));
    vi.doMock("@/lib/translator/translatorSpeechPlayer", () => ({
      TranslatorSpeechPlayer: class {
        dispose = vi.fn();
        play = vi.fn(async () => undefined);
        prepareForUserGesture = vi.fn();
        pausePlayback = vi.fn();
        resumePlayback = vi.fn();
        stopPlayback = vi.fn();
        hasCachedAudio = vi.fn(() => false);
        clearCache = vi.fn();
        constructor() {
          players.push(this);
        }
      },
    }));
    const { useTranslatorSpeech } = await import("@/lib/translator/useTranslatorSpeech");
    const speech = useTranslatorSpeech();

    expect(players).toHaveLength(2);
    expect(players[0].dispose).toHaveBeenCalledOnce();
    expect(players[1].dispose).not.toHaveBeenCalled();
    await speech.playTranslation({
      id: "turn-strict", timestamp: 1, sourceLanguage: "de", targetLanguage: "sw",
      originalText: "Hallo", translatedText: "Habari", sourceWasDetected: false,
    }, 1, true);
    expect(players[0].play).not.toHaveBeenCalled();
    expect(players[1].play).toHaveBeenCalledOnce();
  });
});
