import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("trainer session runtime regression guards", () => {
    const clientSource = fs.readFileSync(path.join(process.cwd(), "src/app/trainer/TrainerClient.tsx"), "utf8");
    const sessionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerSession.ts"), "utf8");
    const controlsSource = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/TrainerControls.tsx"), "utf8");
    const lastMissedSummarySource = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/TrainerLastMissedSummary.tsx"), "utf8");

    it("wires TrainerClient to useTrainerSession", () => {
        expect(clientSource).toContain("useTrainerSession({");
        expect(clientSource).toContain("startLearningSession");
        expect(clientSource).not.toContain("async function gradeCurrent");
    });

    it("resets setup preset to today on dashboard open while preserving quickStart path separately", () => {
        expect(clientSource).toContain("function openSetupFromDashboard()");
        expect(clientSource).toContain("function openSetupFromQuickStart(quickStart: QuickStartPreset)");
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

    it("clarifies last-missed summaries as the current round, not the whole pool", () => {
        expect(clientSource).toContain("const isLastMissedSession = learnMode === \"DRILL\" && trainingMaterial.kind === \"LAST_MISSED\"");
        expect(clientSource).toContain("Wiederholung beendet");
        expect(clientSource).toContain("TrainerLastMissedSummary");
        expect(clientSource).toContain("remainingPoolCount={setupCounts.lastMissedCount}");
        expect(clientSource).toContain("Gezählt werden nur Karten, die du in dieser Runde beantwortet hast.");
        expect(lastMissedSummarySource).toContain("In dieser Runde:");
        expect(lastMissedSummarySource).toContain("Nochmal üben");
        expect(lastMissedSummarySource).toContain("im Fehlerpool");
    });

    it("keeps grading progression and reveal reset", () => {
        expect(sessionSource).toContain("setCurrentIndex(fallbackIndex);");
        expect(sessionSource).toContain("setReveal(false);");
    });

    it("exposes in-flight grading state and disables answer controls during persistence", () => {
        expect(sessionSource).toContain("const [gradingInFlight, setGradingInFlight] = useState(false)");
        expect(sessionSource).toContain("gradingInFlightRef.current = true");
        expect(sessionSource).toContain("canAcceptGradeTap({ gradingInFlight: gradingInFlightRef.current");
        expect(sessionSource).toContain("gradingInFlight, startLearningSession");
        expect(clientSource).toContain("gradingInFlight={gradingInFlight}");
        expect(controlsSource).toContain("disabled={gradingInFlight}");
        expect(controlsSource).toContain("data-grading-in-flight");
        expect(controlsSource).toContain("aria-busy={gradingInFlight}");
    });
});
