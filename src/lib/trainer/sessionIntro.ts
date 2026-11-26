export const TRAINER_SESSION_INTRO_MIN_MS = 1_800;

export function getTrainerSessionIntroDelay({
    startedAt,
    now,
    reducedMotion,
}: {
    startedAt: number;
    now: number;
    reducedMotion: boolean;
}): number {
    if (reducedMotion) return 0;
    return Math.max(0, TRAINER_SESSION_INTRO_MIN_MS - Math.max(0, now - startedAt));
}

export function userPrefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
