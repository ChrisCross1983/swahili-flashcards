import type { Group } from "@/lib/groups/types";
import { materialLabel, type TrainingMaterial } from "@/lib/trainer/setup";
import type { QuickStartPreset } from "@/lib/trainer/useTrainerSetup";

type Props = {
    recommendation: string;
    setupCountsLoading: boolean;
    setupCounts: { todayDue: number; lastMissedCount: number };
    selectedPreset: QuickStartPreset;
    allCardsCount: number;
    allGroupRefinementOpen: boolean;
    trainingMaterial: TrainingMaterial;
    activeTrainerGroupName: string | null;
    groups: Group[];
    directionMode: "DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null;
    directionHighlight: boolean;
    startDisabled: boolean;
    selectedPresetSummary: string;
    selectedPresetCount: number;
    startHint: string | null;
    learnLoadError: string | null;
    onSelectPreset: (preset: QuickStartPreset) => void;
    onToggleAllGroupRefinementOpen: () => void;
    onTrainingMaterialChange: (material: TrainingMaterial) => void;
    onOpenManageGroups: () => void;
    onDirectionModeChange: (mode: "DE_TO_SW" | "SW_TO_DE" | "RANDOM") => void;
    onStart: () => void;
    directionRef: React.RefObject<HTMLDivElement | null>;
    materialRef: React.RefObject<HTMLDivElement | null>;
};

export default function TrainerSetupView(props: Props) {
    const {
        recommendation, setupCountsLoading, setupCounts, selectedPreset, allCardsCount, allGroupRefinementOpen,
        trainingMaterial, activeTrainerGroupName, groups, directionMode, directionHighlight,
        startDisabled, selectedPresetSummary, selectedPresetCount, startHint, learnLoadError,
        onSelectPreset, onToggleAllGroupRefinementOpen, onTrainingMaterialChange, onOpenManageGroups,
        onDirectionModeChange, onStart, directionRef, materialRef,
    } = props;

    return (
        <div className="mt-4 rounded-2xl border p-4 bg-surface shadow-soft">
            <div className="mt-2 hint-card border border-soft"><span className="font-medium text-primary">Empfohlen für dich:</span> {recommendation}</div>
            <div className="mt-3 grid grid-cols-1 gap-3">
                <button type="button" aria-pressed={selectedPreset === "today"} onClick={() => onSelectPreset("today")} className={`relative rounded-2xl border p-4 text-left transition ${selectedPreset === "today" ? "border-accent bg-accent-cta-soft hover:shadow-soft" : "border-soft bg-surface hover:bg-surface-elevated"}`}>
                    <div className="font-semibold">Heute lernen</div><div className="mt-1 text-sm text-muted">Leitner-Runde mit den nächsten Karten.</div><div className="count-badge absolute right-4 top-4">{setupCountsLoading ? "…" : setupCounts.todayDue}</div>
                </button>
                <div className={`relative rounded-2xl border p-4 text-left transition ${selectedPreset === "all" ? "border-accent bg-accent-cta-soft hover:shadow-soft" : "border-soft bg-surface hover:bg-surface-elevated"}`}>
                    <button type="button" aria-pressed={selectedPreset === "all"} onClick={() => onSelectPreset("all")} className="w-full text-left">
                        <div className="font-semibold">Alle Karten üben</div><div className="mt-1 text-sm text-muted">Schneller Drill mit Standardwerten.</div><div className="count-badge absolute right-4 top-4">{setupCountsLoading ? "…" : allCardsCount}</div>
                    </button>
                    {selectedPreset === "all" ? <div ref={materialRef} className="mt-3 rounded-xl border border-soft bg-surface p-3">
                        <button type="button" aria-expanded={allGroupRefinementOpen} onClick={onToggleAllGroupRefinementOpen} className="flex w-full items-center justify-between text-sm"><span>Trainingsmaterial: {materialLabel(trainingMaterial, activeTrainerGroupName)}</span><span>{allGroupRefinementOpen ? "▾" : "▸"}</span></button>
                        {allGroupRefinementOpen ? <div className="mt-2 space-y-2">
                            <select className="w-full rounded-lg border border-soft bg-surface px-3 py-2 text-sm text-primary" value={trainingMaterial.kind === "GROUP" ? (trainingMaterial.groupId ?? "") : ""} onChange={(event) => onTrainingMaterialChange(event.target.value ? { kind: "GROUP", groupId: event.target.value } : { kind: "ALL" })}>
                                <option value="">Alle Karten</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                            </select>
                            <div className="flex items-center justify-between text-xs text-muted"><span>Aktiv: {materialLabel(trainingMaterial, activeTrainerGroupName)}</span><button type="button" className="rounded-lg border border-soft px-2 py-1" onClick={onOpenManageGroups}>Gruppen verwalten</button></div>
                        </div> : null}
                    </div> : null}
                </div>
                <button type="button" aria-pressed={selectedPreset === "last-missed"} onClick={() => onSelectPreset("last-missed")} className={`relative rounded-2xl border p-4 text-left transition ${selectedPreset === "last-missed" ? "border-accent bg-accent-cta-soft hover:shadow-soft" : "border-soft bg-surface hover:bg-surface-elevated"}`}>
                    <div className="font-semibold">Zuletzt nicht gewusst</div><div className="mt-1 text-sm text-muted">Kurze Runde aus dem Fehlerpool.</div><div className="count-badge absolute right-4 top-4">{setupCountsLoading ? "…" : setupCounts.lastMissedCount}</div>
                </button>
            </div>
            <div ref={directionRef} className="mt-4">
                <div className={directionHighlight ? "rounded-3xl p-2 ring-2 ring-[color:var(--accent-cta)] bg-accent-cta-soft" : ""}><div className="rounded-2xl bg-surface p-4 shadow-soft"><div className="text-sm font-semibold text-primary">Abfragerichtung</div>
                    <div className="mt-2 grid grid-cols-1 gap-3">
                        <button type="button" aria-pressed={directionMode === "DE_TO_SW"} onClick={() => onDirectionModeChange("DE_TO_SW")} className={`rounded-xl border p-3 text-left transition active:scale-[0.99] ${directionMode === "DE_TO_SW" ? "border-accent bg-surface shadow-soft" : "border-soft bg-surface hover:bg-surface-elevated"}`}>Deutsch → Swahili</button>
                        <button type="button" aria-pressed={directionMode === "SW_TO_DE"} onClick={() => onDirectionModeChange("SW_TO_DE")} className={`rounded-xl border p-3 text-left transition active:scale-[0.99] ${directionMode === "SW_TO_DE" ? "border-accent bg-surface shadow-soft" : "border-soft bg-surface hover:bg-surface-elevated"}`}>Swahili → Deutsch</button>
                        <button type="button" aria-pressed={directionMode === "RANDOM"} onClick={() => onDirectionModeChange("RANDOM")} className={`rounded-xl border p-3 text-left transition active:scale-[0.99] ${directionMode === "RANDOM" ? "border-accent bg-surface shadow-soft" : "border-soft bg-surface hover:bg-surface-elevated"}`}>Zufällig (Abwechslung)</button>
                    </div></div></div>
            </div>
            <button className="mt-4 w-full btn btn-primary py-3 text-base" type="button" disabled={startDisabled} onClick={onStart}>Session starten · {selectedPresetSummary} ({selectedPresetCount})</button>
            {startHint ? <div className="mt-3 hint-card border-cta bg-accent-cta-soft text-accent-cta">{startHint}</div> : null}
            {learnLoadError ? <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{learnLoadError}</div> : null}
        </div>
    );
}
