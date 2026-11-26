import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
    TRAINER_LION_MOUTH_OPEN_MS,
    TRAINER_LION_MOUTH_WIDE_OPEN_MS,
    TRAINER_SESSION_INTRO_MIN_MS,
} from "@/lib/trainer/sessionIntro";

function readAnimatedWebpFrameDelays(file: string) {
    const bytes = readFileSync(file);
    const delays: number[] = [];
    for (let offset = 12; offset + 16 <= bytes.length;) {
        const tag = bytes.toString("ascii", offset, offset + 4);
        const size = bytes.readUInt32LE(offset + 4);
        if (tag === "ANMF") {
            const durationOffset = offset + 20;
            delays.push(bytes[durationOffset] | (bytes[durationOffset + 1] << 8) | (bytes[durationOffset + 2] << 16));
        }
        offset += 8 + size + (size % 2);
    }
    return delays;
}

describe("retimed trainer lion intro asset", () => {
    it("holds the original six frames naturally for a 3.2-second opening", () => {
        const delays = readAnimatedWebpFrameDelays("public/trainer-lion-intro-timed.webp");

        expect(delays).toEqual([800, 250, 300, 700, 250, 900]);
        expect(delays.reduce((total, delay) => total + delay, 0)).toBe(TRAINER_SESSION_INTRO_MIN_MS);
        expect(delays[0]).toBe(TRAINER_LION_MOUTH_OPEN_MS);
        expect(delays[0] + delays[1] + delays[2]).toBe(TRAINER_LION_MOUTH_WIDE_OPEN_MS);
    });
});
