import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("trainer session runtime regression guards", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/trainer/TrainerClient.tsx"), "utf8");

    it("starts today sessions via today loader", () => {
        expect(source).toContain("if (nextLearnMode === \"LEITNER_TODAY\")");
        expect(source).toContain("loadResult = await loadToday()");
    });

    it("starts all/group drill via all-cards loader", () => {
        expect(source).toContain("nextTrainingMaterial.kind === \"ALL\" || nextTrainingMaterial.kind === \"GROUP\"");
        expect(source).toContain("loadResult = await loadAllForDrill(nextTrainerGroupIds)");
    });

    it("starts last-missed drill via last-missed loader", () => {
        expect(source).toContain("loadResult = await loadLastMissed()");
    });

    it("keeps grading progression and reveal reset", () => {
        expect(source).toContain("setCurrentIndex(fallbackIndex);");
        expect(source).toContain("setReveal(false);");
    });
});
