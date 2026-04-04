import { describe, expect, it } from "vitest";

import {
    canStartTraining,
    DEFAULT_TRAINING_MATERIAL,
    materialLabel,
    resolveTrainingGroupIds,
    visibleBadgeSummary,
    type TrainingMaterial,
} from "../setup";

describe("trainer setup material model", () => {
    it("defaults to all cards", () => {
        expect(DEFAULT_TRAINING_MATERIAL).toEqual({ kind: "ALL" });
        expect(materialLabel(DEFAULT_TRAINING_MATERIAL)).toBe("Alle Karten");
    });

    it("maps group selection to group id filter", () => {
        const material: TrainingMaterial = { kind: "GROUP", groupId: "g-1" };
        expect(resolveTrainingGroupIds(material)).toEqual(["g-1"]);
    });

    it("blocks invalid combinations and requires group selection", () => {
        expect(canStartTraining("LEITNER_TODAY", { kind: "LAST_MISSED" }, "DE_TO_SW")).toBe(false);
        expect(canStartTraining("DRILL", { kind: "GROUP", groupId: null }, "DE_TO_SW")).toBe(false);
        expect(canStartTraining("DRILL", { kind: "ALL" }, "SW_TO_DE")).toBe(true);
    });
});

describe("learning card badge summary", () => {
    it("shows max two badges and an overflow counter", () => {
        const result = visibleBadgeSummary(["a", "b", "c", "d"]);
        expect(result.visible).toEqual(["a", "b"]);
        expect(result.overflow).toBe(2);
    });

    it("keeps all badges when count is small", () => {
        const result = visibleBadgeSummary(["a"]);
        expect(result.visible).toEqual(["a"]);
        expect(result.overflow).toBe(0);
    });
});
