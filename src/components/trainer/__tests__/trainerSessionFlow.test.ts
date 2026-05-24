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

    it("starts today sessions via today loader", () => {
        expect(sessionSource).toContain("if (nextLearnMode === \"LEITNER_TODAY\")");
        expect(sessionSource).toContain("loadResult = await loadToday()");
    });

    it("starts all/group drill via all-cards loader", () => {
        expect(sessionSource).toContain("nextTrainingMaterial.kind === \"ALL\" || nextTrainingMaterial.kind === \"GROUP\"");
        expect(sessionSource).toContain("loadResult = await loadAllForDrill(resolveTrainingGroupIds(nextTrainingMaterial))");
    });

    it("starts last-missed drill via last-missed loader", () => {
        expect(sessionSource).toContain("loadResult = await loadLastMissed()");
    });

    it("keeps grading progression and reveal reset", () => {
        expect(sessionSource).toContain("setCurrentIndex(fallbackIndex);");
        expect(sessionSource).toContain("setReveal(false);");
    });
});
