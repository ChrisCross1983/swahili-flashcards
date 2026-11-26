import { afterEach, describe, expect, it, vi } from "vitest";

import { readTrainerIntroSoundPreference, startTrainerIntroRoar, stopTrainerIntroRoar, TRAINER_INTRO_ROAR_SRC, TRAINER_INTRO_SOUND_PREFERENCE_KEY, writeTrainerIntroSoundPreference } from "../introAudio";

describe("trainer intro audio", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("starts the quiet local roar without awaiting playback", () => {
        const play = vi.fn().mockResolvedValue(undefined);
        const audio = { preload: "", volume: 1, play, addEventListener: vi.fn(), pause: vi.fn(), currentTime: 0 };
        const AudioMock = vi.fn(() => audio);
        vi.stubGlobal("Audio", AudioMock);

        expect(startTrainerIntroRoar({ enabled: true, reducedMotion: false })).toBe(audio);
        expect(AudioMock).toHaveBeenCalledWith(TRAINER_INTRO_ROAR_SRC);
        expect(audio.preload).toBe("auto");
        expect(audio.volume).toBe(0.28);
        expect(play).toHaveBeenCalledOnce();
    });

    it("skips audio for mute and reduced motion", () => {
        const AudioMock = vi.fn();
        vi.stubGlobal("Audio", AudioMock);

        expect(startTrainerIntroRoar({ enabled: false, reducedMotion: false })).toBeNull();
        expect(startTrainerIntroRoar({ enabled: true, reducedMotion: true })).toBeNull();
        expect(AudioMock).not.toHaveBeenCalled();
    });

    it("persists the mute preference and absorbs blocked playback", () => {
        const getItem = vi.fn(() => "0");
        const setItem = vi.fn();
        vi.stubGlobal("window", { localStorage: { getItem, setItem } });
        expect(readTrainerIntroSoundPreference()).toBe(false);
        writeTrainerIntroSoundPreference(true);
        expect(setItem).toHaveBeenCalledWith(TRAINER_INTRO_SOUND_PREFERENCE_KEY, "1");

        const audio = { preload: "", volume: 1, play: vi.fn().mockRejectedValue(new Error("blocked")), addEventListener: vi.fn(), pause: vi.fn(), currentTime: 0 };
        vi.stubGlobal("Audio", vi.fn(() => audio));
        expect(() => startTrainerIntroRoar({ enabled: true, reducedMotion: false })).not.toThrow();
    });

    it("stops playback immediately when the intro is closed", () => {
        const audio = { pause: vi.fn(), currentTime: 1 } as unknown as HTMLAudioElement;
        stopTrainerIntroRoar(audio);
        expect(audio.pause).toHaveBeenCalledOnce();
        expect(audio.currentTime).toBe(0);
    });
});
