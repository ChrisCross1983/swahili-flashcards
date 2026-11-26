export const TRAINER_INTRO_SOUND_PREFERENCE_KEY = "swahili-trainer-intro-sound-enabled";
export const TRAINER_INTRO_ROAR_SRC = "/trainer-lion-roar.m4a";

type IntroAudioPlayback = {
    stop: () => void;
};

type AudioContextConstructor = new () => AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
    if (typeof window === "undefined") return null;
    const audioWindow = window as Window & { webkitAudioContext?: AudioContextConstructor };
    return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

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

export function stopTrainerIntroRoar(playback: IntroAudioPlayback | null) {
    playback?.stop();
}

export function startTrainerIntroRoar({ enabled, reducedMotion, startDelayMs, onEnded }: {
    enabled: boolean;
    reducedMotion: boolean;
    startDelayMs: number;
    onEnded?: () => void;
}): IntroAudioPlayback | null {
    const AudioContextClass = getAudioContextConstructor();
    if (!enabled || reducedMotion || !AudioContextClass || typeof fetch === "undefined") return null;

    const context = new AudioContextClass();
    const startedAt = performance.now();
    const controller = new AbortController();
    let source: AudioBufferSourceNode | null = null;
    let stopped = false;
    const closeContext = () => {
        void context.close().catch(() => {});
    };

    const stop = () => {
        stopped = true;
        controller.abort();
        try { source?.stop(); } catch { /* Source may not have started yet. */ }
        closeContext();
    };

    // resume() intentionally runs in the user's start-click stack. Once unlocked,
    // Safari permits the decoded buffer to be scheduled at the visual mouth cue.
    void context.resume().then(async () => {
        const response = await fetch(TRAINER_INTRO_ROAR_SRC, { signal: controller.signal });
        if (!response.ok) {
            closeContext();
            return;
        }
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        if (stopped) {
            closeContext();
            return;
        }

        source = context.createBufferSource();
        const gain = context.createGain();
        gain.gain.value = 0.28;
        source.buffer = decoded;
        source.connect(gain).connect(context.destination);
        source.onended = () => {
            if (!stopped) onEnded?.();
            closeContext();
        };
        const remainingDelay = Math.max(0, startDelayMs - (performance.now() - startedAt)) / 1_000;
        source.start(context.currentTime + remainingDelay);
    }).catch(() => {
        // Fetch/decode/autoplay failures are non-blocking: the visual intro continues silently.
        closeContext();
    });

    return { stop };
}
