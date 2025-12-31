let correctAudio: HTMLAudioElement | null = null;
let wrongAudio: HTMLAudioElement | null = null;

function safePlay(a: HTMLAudioElement) {
    try {
        a.currentTime = 0;
        void a.play();
    } catch {
        // ignore
    }
}

export function initFeedbackSounds() {
    if (typeof window === "undefined") return;

    if (!correctAudio) correctAudio = new Audio("/audio/correct.m4a");
    if (!wrongAudio) wrongAudio = new Audio("/audio/wrong.m4a");

    correctAudio.preload = "auto";
    wrongAudio.preload = "auto";
}

export function playCorrect() {
    if (!correctAudio) correctAudio = new Audio("/audio/correct.m4a");
    safePlay(correctAudio);
}

export function playWrong() {
    if (!wrongAudio) wrongAudio = new Audio("/audio/wrong.m4a");
    safePlay(wrongAudio);
}
