import { useEffect, useMemo, useState } from "react";
import { canStartTraining, materialLabel, type TrainingMaterial } from "@/lib/trainer/setup";

export type QuickStartPreset = "today" | "all" | "last-missed";

export type SetupCounts = {
    todayDue: number;
    totalCards: number;
    lastMissedCount: number;
};

export const DEFAULT_TRAINING_PRESET: QuickStartPreset = "today";

type Params = {
    setupCounts: SetupCounts;
    setupCountsLoading: boolean;
    trainingMaterial: TrainingMaterial;
    activeTrainerGroupName: string | null;
    directionMode: "DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null;
    entryQuickStartPreset: QuickStartPreset | null;
    allPresetFilteredCount: number | null;
    isSentenceTrainer: boolean;
    onTrainingMaterialChange: (material: TrainingMaterial) => void;
    onAllPresetFilteredCountChange: (value: number | null) => void;
};

export function deriveSelectedSessionConfig(
    preset: QuickStartPreset,
    trainingMaterial: TrainingMaterial,
) {
    if (preset === "today") {
        return { learnMode: "LEITNER_TODAY" as const, trainingMaterial: { kind: "ALL" } as TrainingMaterial };
    }
    if (preset === "last-missed") {
        return { learnMode: "DRILL" as const, trainingMaterial: { kind: "LAST_MISSED" } as TrainingMaterial };
    }
    return { learnMode: "DRILL" as const, trainingMaterial: trainingMaterial.kind === "GROUP" ? trainingMaterial : { kind: "ALL" } as TrainingMaterial };
}

export function useTrainerSetup({
    setupCounts,
    setupCountsLoading,
    trainingMaterial,
    activeTrainerGroupName,
    directionMode,
    entryQuickStartPreset,
    allPresetFilteredCount,
    isSentenceTrainer,
    onTrainingMaterialChange,
    onAllPresetFilteredCountChange,
}: Params) {
    const [selectedTrainingPreset, setSelectedTrainingPreset] = useState<QuickStartPreset | null>(null);
    const [allGroupRefinementOpen, setAllGroupRefinementOpen] = useState(false);

    const recommendedQuickStartPreset: QuickStartPreset = DEFAULT_TRAINING_PRESET;

    const selectedPreset = selectedTrainingPreset ?? entryQuickStartPreset ?? recommendedQuickStartPreset;

    const allCardsCount = trainingMaterial.kind === "GROUP" && trainingMaterial.groupId
        ? (allPresetFilteredCount ?? 0)
        : setupCounts.totalCards;

    const selectedPresetCount = selectedPreset === "today"
        ? setupCounts.todayDue
        : selectedPreset === "last-missed"
            ? setupCounts.lastMissedCount
            : allCardsCount;

    const selectedPresetSummary = selectedPreset === "today"
        ? "Heute lernen"
        : selectedPreset === "last-missed"
            ? "Zuletzt nicht gewusst"
            : materialLabel(trainingMaterial, activeTrainerGroupName);

    const selectedSessionConfig = deriveSelectedSessionConfig(selectedPreset, trainingMaterial);

    const missingDirection = directionMode === null;
    const startDisabled = !canStartTraining(selectedSessionConfig.learnMode, selectedSessionConfig.trainingMaterial, directionMode);
    const directionHighlight = missingDirection && startDisabled;

    const startHint = selectedSessionConfig.trainingMaterial.kind === "GROUP" && !selectedSessionConfig.trainingMaterial.groupId
        ? "Gruppe auswählen"
        : missingDirection
            ? "Abfragerichtung wählen"
            : null;

    const recommendation = useMemo(() => {
        if (setupCountsLoading) return "Lade Empfehlung…";
        if (setupCounts.todayDue > 0) {
            return `Heute fällig: ${setupCounts.todayDue} ${isSentenceTrainer ? "Sätze" : "Karten"}`;
        }
        if (setupCounts.lastMissedCount > 0) {
            return `Zuletzt nicht gewusst: ${setupCounts.lastMissedCount}`;
        }
        return `Beste nächste Session: ${setupCounts.totalCards > 0 ? "Alle Karten üben" : "Neue Karten anlegen"}`;
    }, [isSentenceTrainer, setupCounts, setupCountsLoading]);

    const selectTrainingPreset = (nextPreset: QuickStartPreset) => {
        setSelectedTrainingPreset(nextPreset);
        if (nextPreset === "all") return;
        setAllGroupRefinementOpen(false);
        onTrainingMaterialChange({ kind: "ALL" });
        onAllPresetFilteredCountChange(null);
    };

    useEffect(() => {
        if (selectedTrainingPreset) return;
        setSelectedTrainingPreset(entryQuickStartPreset ?? DEFAULT_TRAINING_PRESET);
    }, [entryQuickStartPreset, recommendedQuickStartPreset, selectedTrainingPreset]);

    return {
        selectedTrainingPreset,
        allGroupRefinementOpen,
        selectedPreset,
        selectedPresetCount,
        selectedPresetSummary,
        selectedSessionConfig,
        startDisabled,
        startHint,
        recommendation,
        directionHighlight,
        setAllGroupRefinementOpen,
        selectTrainingPreset,
    };
}
