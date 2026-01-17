let correctAudio: HTMLAudioElement | null = null;
let wrongAudio: HTMLAudioElement | null = null;

const SOUND_ENABLED = false;

function safePlay(a: HTMLAudioElement) {
    if (!SOUND_ENABLED) return;
    try {
        a.currentTime = 0;
        void a.play();
    } catch {
        // ignore
    }
}

export function initFeedbackSounds() {
    // absichtlich leer
}

export function playCorrect() {
    // noop
}

export function playWrong() {
    // noop
}
