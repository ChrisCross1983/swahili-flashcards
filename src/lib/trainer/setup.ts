export type TrainingMethod = "LEITNER_TODAY" | "DRILL";

export type TrainingMaterial =
    | { kind: "ALL" }
    | { kind: "LAST_MISSED" }
    | { kind: "GROUP"; groupId: string | null };

export const DEFAULT_TRAINING_MATERIAL: TrainingMaterial = { kind: "ALL" };

export function resolveTrainingGroupIds(material: TrainingMaterial): string[] {
    if (material.kind !== "GROUP" || !material.groupId) return [];
    return [material.groupId];
}

export function canStartTraining(method: TrainingMethod | null, material: TrainingMaterial | null, directionMode: "DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null): boolean {
    if (!method || !material || !directionMode) return false;
    if (material.kind === "GROUP" && !material.groupId) return false;
    if (method === "LEITNER_TODAY" && material.kind === "LAST_MISSED") return false;
    return true;
}

export function materialLabel(material: TrainingMaterial | null, groupName?: string | null): string {
    if (!material || material.kind === "ALL") return "Alle Karten";
    if (material.kind === "LAST_MISSED") return "Zuletzt nicht gewusst";
    return groupName ? `Gruppe: ${groupName}` : "Gruppe auswählen";
}

export function visibleBadgeSummary<T>(items: T[], maxVisible = 2): { visible: T[]; overflow: number } {
    if (items.length <= maxVisible) return { visible: items, overflow: 0 };
    return {
        visible: items.slice(0, maxVisible),
        overflow: items.length - maxVisible,
    };
}
