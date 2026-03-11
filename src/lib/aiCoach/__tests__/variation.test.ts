import { describe, expect, it } from "vitest";
import { pickBoundedIndex, rotateDeterministic } from "../variation";

describe("bounded variation", () => {
    it("keeps index within top bounded window", () => {
        const idx = pickBoundedIndex(10, "seed-a", 3);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(3);
    });

    it("deterministically rotates distractor order", () => {
        const base = ["a", "b", "c", "d"];
        const first = rotateDeterministic(base, "seed-1");
        const second = rotateDeterministic(base, "seed-1");
        expect(first).toEqual(second);
        expect(first).not.toEqual(base);
    });
});
