import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("react");
  vi.doUnmock("@/lib/translator/speechClient");
  vi.doUnmock("@/lib/translator/translatorSpeechPlayer");
  vi.doUnmock("@/lib/translator/firstSentenceSpeechPlayer");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("useTranslatorSpeech lifecycle", () => {
  it("selects the two-asset player only behind the spike flag and automatically falls back before first playback", async () => {
    vi.stubEnv("NEXT_PUBLIC_TRANSLATOR_FIRST_SENTENCE_FAST_TTS", "true");
    const refs = [{ current: null }, { current: null }, { current: false }];
    vi.doMock("react", () => ({
      useRef: () => refs.shift(),
      useCallback: <T,>(callback: T) => callback,
      useEffect: (setup: () => void | (() => void)) => { setup(); },
    }));
    const legacyPlay = vi.fn(async () => undefined);
    const segmentedPlay = vi.fn(async () => undefined);
    vi.doMock("@/lib/translator/translatorSpeechPlayer", () => ({
      TranslatorSpeechPlayer: class {
        play = legacyPlay;
        dispose = vi.fn(); prepareForUserGesture = vi.fn();
        pausePlayback = vi.fn(); resumePlayback = vi.fn(); stopPlayback = vi.fn();
        hasCachedAudio = vi.fn(() => false); clearCache = vi.fn();
      },
    }));
    class FirstSegmentNotStartedError extends Error {}
    vi.doMock("@/lib/translator/firstSentenceSpeechPlayer", () => ({
      FirstSegmentNotStartedError,
      FirstSentenceSpeechPlayer: class {
        play = segmentedPlay;
        dispose = vi.fn(); prepareForUserGesture = vi.fn();
        pausePlayback = vi.fn(); resumePlayback = vi.fn(); stopPlayback = vi.fn();
        hasCachedAudio = vi.fn(() => false); clearCache = vi.fn();
      },
    }));
    const { useTranslatorSpeech } = await import("@/lib/translator/useTranslatorSpeech");
    const speech = useTranslatorSpeech();
    const first = "Leo ilikuwa siku yenye shughuli nyingi sana.";
    const rest = " Asubuhi nilikwenda sokoni na kununua matunda mengi. Baadaye nilikutana na rafiki yangu na tukazungumza kwa muda mrefu. Jioni nilirudi nyumbani, nikapika chakula, na nikapumzika baada ya siku ndefu yenye shughuli nyingi na mazungumzo mazuri pamoja na marafiki zangu wa karibu.";
    const entry = {
      id: "turn-long", timestamp: 1, sourceLanguage: "de" as const,
      targetLanguage: "sw" as const, originalText: "Original", translatedText: first + rest,
      sourceWasDetected: false,
    };
    await speech.playTranslation(entry, 1, true);
    expect(segmentedPlay).toHaveBeenCalledWith(entry, 1, { first, rest }, expect.any(Object));
    expect(legacyPlay).not.toHaveBeenCalled();

    segmentedPlay.mockRejectedValueOnce(new FirstSegmentNotStartedError());
    await speech.playTranslation(entry, 1, true);
    expect(legacyPlay).toHaveBeenCalledWith(entry, 1, expect.any(Object));
    await speech.playTranslation({ ...entry, translatedText: "Habari za asubuhi." }, 1, false);
    expect(legacyPlay).toHaveBeenCalledTimes(2);
  });

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
