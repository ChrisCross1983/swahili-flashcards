export function speakSwahili(text: string, opts?: { slow?: boolean }) {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    try {
        synth.cancel();

        const u = new SpeechSynthesisUtterance(text);
        // best effort: swahili locale
        u.lang = "sw";
        u.rate = opts?.slow ? 0.75 : 1.0;

        synth.speak(u);
    } catch {
        // ignorieren
    }
}
