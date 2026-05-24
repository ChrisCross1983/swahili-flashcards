import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { canStartTraining } from "@/lib/trainer/setup";
import { DEFAULT_TRAINING_PRESET, deriveSelectedSessionConfig } from "@/lib/trainer/useTrainerSetup";

describe("useTrainerSetup derivation", () => {
    it("defaults fresh setup selection to today", () => {
        expect(DEFAULT_TRAINING_PRESET).toBe("today");
    });

    it("keeps explicit quickStart able to override the default", () => {
        const source = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerSetup.ts"), "utf8");
        expect(source).toContain("entryQuickStartPreset ?? DEFAULT_TRAINING_PRESET");
    });

    it("keeps manual preset switching intact", () => {
        const source = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerSetup.ts"), "utf8");
        expect(source).toContain("const selectTrainingPreset = (nextPreset: QuickStartPreset)");
        expect(source).toContain("setSelectedTrainingPreset(nextPreset)");
    });

    it("exposes an explicit reset for fresh setup opens", () => {
        const source = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerSetup.ts"), "utf8");
        expect(source).toContain("const resetTrainingPreset = (nextPreset: QuickStartPreset = DEFAULT_TRAINING_PRESET)");
        expect(source).toContain("resetTrainingPreset,");
    });

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
