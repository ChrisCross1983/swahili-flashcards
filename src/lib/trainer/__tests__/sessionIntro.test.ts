import { describe, expect, it } from "vitest";

import { getTrainerSessionIntroDelay, TRAINER_LION_MOUTH_OPEN_MS, TRAINER_LION_MOUTH_WIDE_OPEN_MS, TRAINER_SESSION_INTRO_MIN_MS } from "../sessionIntro";

describe("trainer session intro timing", () => {
    it("keeps a successful normal-motion intro visible for at least 3.2 seconds", () => {
        expect(getTrainerSessionIntroDelay({ startedAt: 1_000, now: 1_200, reducedMotion: false })).toBe(TRAINER_SESSION_INTRO_MIN_MS - 200);
        expect(getTrainerSessionIntroDelay({ startedAt: 1_000, now: 4_200, reducedMotion: false })).toBe(0);
    });

    it("defines the mouth timing from the retimed source frames", () => {
        expect(TRAINER_LION_MOUTH_OPEN_MS).toBe(800);
        expect(TRAINER_LION_MOUTH_WIDE_OPEN_MS).toBe(1350);
    });

    it("does not add an artificial delay for reduced motion", () => {
        expect(getTrainerSessionIntroDelay({ startedAt: 1_000, now: 1_001, reducedMotion: true })).toBe(0);
    });
});
