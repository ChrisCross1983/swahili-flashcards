import { describe, expect, it } from "vitest";
import { GROUP_COLOR_PALETTE, isGroupColorKey, resolveGroupColor } from "./colors";

describe("controlled group colors", () => {
    it("provides a finite muted palette and a neutral fallback for missing or legacy values", () => {
        expect(GROUP_COLOR_PALETTE).toHaveLength(11);
        expect(new Set(GROUP_COLOR_PALETTE.map((entry) => entry.key)).size).toBe(GROUP_COLOR_PALETTE.length);
        expect(resolveGroupColor(null).key).toBe("neutral");
        expect(resolveGroupColor("#ff0000").key).toBe("neutral");
        expect(resolveGroupColor("sage").label).toBe("Salbei");
    });

    it("accepts only palette keys for new writes", () => {
        expect(isGroupColorKey("sage")).toBe(true);
        expect(isGroupColorKey("blue")).toBe(true);
        expect(isGroupColorKey("#ff0000")).toBe(false);
        expect(isGroupColorKey("neon")).toBe(false);
    });
});
