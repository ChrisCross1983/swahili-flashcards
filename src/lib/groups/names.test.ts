import { describe, expect, it } from "vitest";
import { cleanGroupName, normalizeGroupName } from "./names";

describe("group name normalization", () => {
    it("trims and collapses whitespace for storage and comparison", () => {
        expect(cleanGroupName("  Test  gruppe  ")).toBe("Test gruppe");
        expect(normalizeGroupName("  TEST   Gruppe ")).toBe(normalizeGroupName("test gruppe"));
    });

    it("compares complete names rather than substrings", () => {
        expect(normalizeGroupName("Test")).not.toBe(normalizeGroupName("Testgruppe"));
        expect(normalizeGroupName("Test")).not.toBe(normalizeGroupName("Testgruppe 2"));
    });
});
