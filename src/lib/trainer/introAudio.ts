export const TRAINER_INTRO_SOUND_PREFERENCE_KEY = "swahili-trainer-intro-sound-enabled";
export const TRAINER_INTRO_ROAR_SRC = "/trainer-lion-roar.m4a";

export function readTrainerIntroSoundPreference(): boolean {
    if (typeof window === "undefined") return true;
    try {
        return window.localStorage.getItem(TRAINER_INTRO_SOUND_PREFERENCE_KEY) !== "0";
    } catch {
        return true;
    }
}

export function writeTrainerIntroSoundPreference(enabled: boolean) {
    try {
        window.localStorage.setItem(TRAINER_INTRO_SOUND_PREFERENCE_KEY, enabled ? "1" : "0");
    } catch {
        // Storage is optional; the in-memory setting remains active for this visit.
    }
}

export function stopTrainerIntroRoar(audio: HTMLAudioElement | null) {
    if (!audio) return;
    audio.pause();
    try {
        audio.currentTime = 0;
    } catch {
        // Seeking can fail before metadata is available; pausing is sufficient.
    }
}

export function startTrainerIntroRoar({ enabled, reducedMotion, onEnded }: {
    enabled: boolean;
    reducedMotion: boolean;
    onEnded?: () => void;
}): HTMLAudioElement | null {
    if (!enabled || reducedMotion || typeof Audio === "undefined") return null;

    const audio = new Audio(TRAINER_INTRO_ROAR_SRC);
    audio.preload = "auto";
    audio.volume = 0.28;
    audio.addEventListener("ended", onEnded ?? (() => {}), { once: true });
    void audio.play().catch(() => {
        // Autoplay policies, a decode error, or an interrupted start must never block the session.
    });
    return audio;
}
