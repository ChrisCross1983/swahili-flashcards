import { describe, expect, it } from "vitest";

import { canStartTraining } from "@/lib/trainer/setup";
import { deriveSelectedSessionConfig } from "@/lib/trainer/useTrainerSetup";

describe("useTrainerSetup derivation", () => {
    it("maps session config for all presets", () => {
        expect(deriveSelectedSessionConfig("today", { kind: "GROUP", groupId: "g1" })).toEqual({
            learnMode: "LEITNER_TODAY",
            trainingMaterial: { kind: "ALL" },
        });

        expect(deriveSelectedSessionConfig("all", { kind: "ALL" })).toEqual({
            learnMode: "DRILL",
            trainingMaterial: { kind: "ALL" },
        });

        expect(deriveSelectedSessionConfig("all", { kind: "GROUP", groupId: "g1" })).toEqual({
            learnMode: "DRILL",
            trainingMaterial: { kind: "GROUP", groupId: "g1" },
        });

        expect(deriveSelectedSessionConfig("last-missed", { kind: "GROUP", groupId: "g1" })).toEqual({
            learnMode: "DRILL",
            trainingMaterial: { kind: "LAST_MISSED" },
        });
    });

    it("keeps start guard semantics unchanged", () => {
        expect(canStartTraining("DRILL", { kind: "GROUP", groupId: null }, "RANDOM")).toBe(false);
        expect(canStartTraining("DRILL", { kind: "ALL" }, null)).toBe(false);
        expect(canStartTraining("LEITNER_TODAY", { kind: "ALL" }, "RANDOM")).toBe(true);
    });
});
