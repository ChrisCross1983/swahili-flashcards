import { describe, expect, it } from "vitest";

import { getTrainerSessionIntroDelay, TRAINER_SESSION_INTRO_MIN_MS } from "../sessionIntro";

describe("trainer session intro timing", () => {
    it("keeps a successful normal-motion intro visible for at least 1.8 seconds", () => {
        expect(getTrainerSessionIntroDelay({ startedAt: 1_000, now: 1_200, reducedMotion: false })).toBe(TRAINER_SESSION_INTRO_MIN_MS - 200);
        expect(getTrainerSessionIntroDelay({ startedAt: 1_000, now: 3_000, reducedMotion: false })).toBe(0);
    });

    it("does not add an artificial delay for reduced motion", () => {
        expect(getTrainerSessionIntroDelay({ startedAt: 1_000, now: 1_001, reducedMotion: true })).toBe(0);
    });
});
