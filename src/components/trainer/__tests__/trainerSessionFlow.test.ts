import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("trainer session runtime regression guards", () => {
    const clientSource = fs.readFileSync(path.join(process.cwd(), "src/app/trainer/TrainerClient.tsx"), "utf8");
    const sessionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerSession.ts"), "utf8");

    it("wires TrainerClient to useTrainerSession", () => {
        expect(clientSource).toContain("useTrainerSession({");
        expect(clientSource).toContain("startLearningSession");
        expect(clientSource).not.toContain("async function gradeCurrent");
    });

    it("resets setup preset to today on dashboard open while preserving quickStart path separately", () => {
        expect(clientSource).toContain('resetTrainingPreset("today")');
        expect(clientSource).toContain("setEntryQuickStartPreset(null)");
        expect(clientSource).toContain("selectTrainingPreset(quickStart)");
    });

    it("starts today sessions via today loader", () => {
        expect(sessionSource).toContain("const loadPlan = getSessionLoadPlan(nextLearnMode, nextTrainingMaterial)");
        expect(sessionSource).toContain('if (loadPlan?.kind === "today")');
        expect(sessionSource).toContain("loadResult = await loadToday()");
    });

    it("starts all/group drill via all-cards loader", () => {
        expect(sessionSource).toContain('} else if (loadPlan?.kind === "all")');
        expect(sessionSource).toContain("loadResult = await loadAllForDrill(loadPlan.groupIds)");
    });

    it("starts last-missed drill via last-missed loader", () => {
        expect(sessionSource).toContain('} else if (loadPlan?.kind === "last-missed")');
        expect(sessionSource).toContain("loadResult = await loadLastMissed()");
    });

    it("keeps grading progression and reveal reset", () => {
        expect(sessionSource).toContain("setCurrentIndex(fallbackIndex);");
        expect(sessionSource).toContain("setReveal(false);");
    });
});
