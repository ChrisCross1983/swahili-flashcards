import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("trainer session runtime regression guards", () => {
    const clientSource = fs.readFileSync(path.join(process.cwd(), "src/app/trainer/TrainerClient.tsx"), "utf8");
    const sessionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerSession.ts"), "utf8");
    const controlsSource = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/TrainerControls.tsx"), "utf8");
    const lastMissedSummarySource = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/TrainerLastMissedSummary.tsx"), "utf8");
    const nextStepSource = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/TrainerSummaryNextStep.tsx"), "utf8");
    const summarySource = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/TrainerSessionSummary.tsx"), "utf8");

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
        expect(clientSource).toContain("resetTrainingPreset(quickStart)");
        expect(clientSource).toContain("if (quickStart === \"all\") setTrainingMaterial({ kind: \"ALL\" })");
        expect(clientSource).toContain("if (quickStart === \"last-missed\") setTrainingMaterial({ kind: \"LAST_MISSED\" })");
    });

    it("supports one-tap dashboard learning without leaking stale setup state", () => {
        expect(clientSource).toContain("function dashboardStartPreset()");
        expect(clientSource).toContain("if (setupCounts.todayDue > 0) return \"today\";");
        expect(clientSource).toContain("if (setupCounts.lastMissedCount > 0) return \"last-missed\";");
        expect(clientSource).toContain("function startRecommendedLearningFromDashboard()");
        expect(clientSource).toContain("resetTrainingPreset(quickStart)");
        expect(clientSource).toContain("setTrainingMaterial(nextConfig.trainingMaterial)");
        expect(clientSource).toContain("setDirectionMode(\"RANDOM\")");
        expect(clientSource).toContain("setDirectStartPreparing(true)");
        expect(clientSource).toContain("setDirectStartPreparing(false)");
        expect(clientSource).toContain("directStartCancelledRef.current = false");
        expect(clientSource).toContain("if (directStartCancelledRef.current)");
        expect(clientSource).toContain("startLearningSession({");
        expect(clientSource).toContain("directionMode: \"RANDOM\"");
        expect(clientSource).toContain("onStartLearning={startRecommendedLearningFromDashboard}");
        expect(clientSource).toContain("onOpenLearn={openSetupFromDashboard}");
    });

    it("gates direct-start rendering with a transition instead of setup", () => {
        expect(clientSource).toContain("TrainerSessionTransition");
        expect(clientSource).toContain("if (directStartPreparing) {");
        expect(clientSource).toContain("directStartCancelledRef.current = true");
        expect(clientSource).toContain("directStartPreparing && !learnStarted ? (");
        expect(clientSource).toContain("<TrainerSessionTransition />");
        expect(clientSource).toContain(": !learnStarted && (");
        expect(clientSource).toContain("function openSetupFromDashboard()");
        expect(clientSource).toContain("setDirectStartPreparing(false)");
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
        expect(clientSource).toContain("remainingPoolCount: isLastMissedSession || lastMissedEmpty ? setupCounts.lastMissedCount : undefined");
        expect(clientSource).toContain("TrainerSessionSummary");
        expect(clientSource).not.toContain("TrainerLastMissedSummary");
        expect(clientSource).not.toContain("TrainerSummaryNextStep");
        expect(summarySource).toContain("Wiederholung beendet");
        expect(summarySource).toContain("TrainerLastMissedSummary");
        expect(summarySource).toContain("TrainerSummaryNextStep");
        expect(summarySource).toContain("Gezählt werden nur Karten, die du in dieser Runde beantwortet hast.");
        expect(summarySource).toContain("Wiederholt nur die nicht gewussten Karten aus dieser Runde.");
        expect(lastMissedSummarySource).toContain("In dieser Runde:");
        expect(lastMissedSummarySource).toContain("Nicht gewusst");
        expect(lastMissedSummarySource).not.toContain("Nochmal üben");
        expect(lastMissedSummarySource).toContain("Trefferquote");
        expect(lastMissedSummarySource).toContain("Gezählt werden nur Karten, die du in dieser Runde beantwortet hast.");
        expect(lastMissedSummarySource).toContain("Im Fehlerpool verbleiben");
    });

    it("keeps grading progression and reveal reset", () => {
        expect(sessionSource).toContain("setCurrentIndex(fallbackIndex);");
        expect(sessionSource).toContain("setReveal(false);");
    });

    it("adds calm next-step guidance to summary states", () => {
        expect(nextStepSource).toContain("Nächster sinnvoller Schritt");
        expect(nextStepSource).toContain("Fertig");
        expect(summarySource).toContain("Für heute bist du durch");
        expect(summarySource).toContain("Starke Runde. Du hast heute viele Karten sicher gewusst.");
        expect(summarySource).toContain("Du hast eine kurze Runde geschafft.");
        expect(summarySource).toContain("Fehler kurz wiederholt");
        expect(summarySource).toContain("Die kurze Fehlerwiederholung ist abgeschlossen.");
        expect(summarySource).toContain("Du kannst später weitermachen oder eine andere kleine Runde starten.");
    });

    it("offers a wrong-answer repair drill without changing learning semantics", () => {
        expect(clientSource).toContain("function TrainerClient");
        expect(clientSource).toContain("const startWrongAnswerRepairDrill = useCallback(() => {");
        expect(clientSource).toContain("const repeatItems = Object.values(sessionWrongItems)");
        expect(clientSource).toContain("if (repeatItems.length === 0) return;");
        expect(clientSource).toContain("resetSessionTracking();");
        expect(clientSource).toContain('setLearnMode("DRILL")');
        expect(clientSource).toContain('setTrainingMaterial({ kind: "LAST_MISSED" })');
        expect(clientSource).toContain("setRepairDrillActive(true)");
        expect(clientSource).toContain("setRepairDrillActive(false)");
        expect(clientSource).toContain("startDrillWithItems(repeatItems)");
        expect(clientSource).toContain("wrongCount: sessionWrongIds.size");
        expect(clientSource).not.toContain("Nicht gewusste wiederholen");
        expect(sessionSource).toContain("function startDrillWithItems(items: TodayItem[])");
        expect(sessionSource).toContain("setSessionTotal(items.length)");
        expect(sessionSource).toContain("setCurrentIndex(0)");
        expect(sessionSource).toContain("setReveal(false)");
        expect(sessionSource).not.toContain("ALTER TABLE");
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
