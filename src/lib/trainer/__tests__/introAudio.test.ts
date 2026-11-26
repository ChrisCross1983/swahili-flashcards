import { afterEach, describe, expect, it, vi } from "vitest";

import {
    readTrainerIntroSoundPreference,
    startTrainerIntroRoar,
    stopTrainerIntroRoar,
    TRAINER_INTRO_ROAR_SRC,
    TRAINER_INTRO_SOUND_PREFERENCE_KEY,
    writeTrainerIntroSoundPreference,
} from "../introAudio";

async function flushAudioTasks() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function installAudioContext() {
    const source = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
    };
    const gain = { gain: { value: 1 }, connect: vi.fn() };
    source.connect.mockReturnValue(gain);
    const context = {
        resume: vi.fn().mockResolvedValue(undefined),
        decodeAudioData: vi.fn().mockResolvedValue({}),
        createBufferSource: vi.fn(() => source),
        createGain: vi.fn(() => gain),
        destination: {},
        currentTime: 5,
        close: vi.fn().mockResolvedValue(undefined),
    };
    const AudioContextMock = vi.fn(() => context);
    const getItem = vi.fn((): string | null => null);
    const setItem = vi.fn();

    vi.stubGlobal("window", { AudioContext: AudioContextMock, localStorage: { getItem, setItem } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    }));
    vi.stubGlobal("performance", { now: vi.fn(() => 100) });

    return { AudioContextMock, context, gain, getItem, setItem, source };
}

describe("trainer intro audio", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("unlocks Web Audio immediately and schedules the local roar at the mouth-opening cue", async () => {
        const { AudioContextMock, context, gain, source } = installAudioContext();

        const playback = startTrainerIntroRoar({ enabled: true, reducedMotion: false, startDelayMs: 800 });
        expect(playback).not.toBeNull();
        expect(AudioContextMock).toHaveBeenCalledOnce();
        // resume() is invoked synchronously in the user-click call stack.
        expect(context.resume).toHaveBeenCalledOnce();

        await flushAudioTasks();
        expect(fetch).toHaveBeenCalledWith(TRAINER_INTRO_ROAR_SRC, expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(context.decodeAudioData).toHaveBeenCalledOnce();
        expect(gain.gain.value).toBe(0.28);
        expect(source.start).toHaveBeenCalledWith(5.8);
    });

    it("skips audio for mute and reduced motion", () => {
        const { AudioContextMock } = installAudioContext();

        expect(startTrainerIntroRoar({ enabled: false, reducedMotion: false, startDelayMs: 800 })).toBeNull();
        expect(startTrainerIntroRoar({ enabled: true, reducedMotion: true, startDelayMs: 800 })).toBeNull();
        expect(AudioContextMock).not.toHaveBeenCalled();
    });

    it("persists the mute preference and absorbs failed fetch/decode/playback", async () => {
        const { getItem, setItem } = installAudioContext();
        getItem.mockReturnValue("0");
        expect(readTrainerIntroSoundPreference()).toBe(false);
        writeTrainerIntroSoundPreference(true);
        expect(setItem).toHaveBeenCalledWith(TRAINER_INTRO_SOUND_PREFERENCE_KEY, "1");

        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("blocked")));
        expect(() => startTrainerIntroRoar({ enabled: true, reducedMotion: false, startDelayMs: 800 })).not.toThrow();
        await flushAudioTasks();
    });

    it("continues silently when Safari cannot resume the audio context", async () => {
        const { context } = installAudioContext();
        context.resume.mockRejectedValue(new Error("user activation unavailable"));

        expect(() => startTrainerIntroRoar({ enabled: true, reducedMotion: false, startDelayMs: 800 })).not.toThrow();
        await flushAudioTasks();
        expect(context.close).toHaveBeenCalledOnce();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("stops a scheduled or active roar immediately when the intro is closed", async () => {
        const { context, source } = installAudioContext();
        const playback = startTrainerIntroRoar({ enabled: true, reducedMotion: false, startDelayMs: 800 });
        await flushAudioTasks();

        stopTrainerIntroRoar(playback);
        expect(source.stop).toHaveBeenCalledOnce();
        expect(context.close).toHaveBeenCalledOnce();
    });
});
