"use client";

import { useMemo, useState } from "react";
import type { Group } from "@/lib/groups/types";
import GroupBadge from "@/components/groups/GroupBadge";
import { createGroup } from "@/lib/groups/api";

type Props = {
    groups: Group[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    label?: string;
    emptyText?: string;
    assignedIds?: string[];
    showAllOption?: boolean;
    allLabel?: string;
    allActive?: boolean;
    onSelectAll?: () => void;
    allowCreate?: boolean;
    onGroupCreated?: (group: Group) => void;
    autoSelectCreated?: boolean;
};

export default function GroupSelector({
    groups,
    selectedIds,
    onChange,
    label = "Gruppen",
    emptyText = "Noch keine Gruppen.",
    assignedIds = [],
    showAllOption = false,
    allLabel = "Alle Karten",
    allActive = false,
    onSelectAll,
    allowCreate = false,
    onGroupCreated,
    autoSelectCreated = true,
}: Props) {
    const [newGroupName, setNewGroupName] = useState("");
    const [createStatus, setCreateStatus] = useState<string | null>(null);
    const [createBusy, setCreateBusy] = useState(false);
    const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);
    const assignedSet = useMemo(() => new Set(assignedIds.map(String)), [assignedIds]);

    function toggle(id: string) {
        if (selectedSet.has(id)) {
            onChange(selectedIds.filter((value) => value !== id));
            return;
        }
        onChange([...selectedIds, id]);
    }

    async function handleCreate() {
        const trimmed = newGroupName.trim();
        if (!trimmed) {
            setCreateStatus("Bitte Gruppennamen eingeben.");
            return;
        }

        const duplicate = groups.find((group) => group.name.trim().toLowerCase() === trimmed.toLowerCase());
        if (duplicate) {
            setCreateStatus(`„${duplicate.name}“ existiert bereits.`);
            if (autoSelectCreated && !selectedSet.has(duplicate.id)) {
                onChange([...selectedIds, duplicate.id]);
            }
            return;
        }

        setCreateBusy(true);
        setCreateStatus(null);

        try {
            const created = await createGroup({ name: trimmed });
            onGroupCreated?.(created);
            setNewGroupName("");

            if (autoSelectCreated) {
                onChange(Array.from(new Set([...selectedIds, created.id])));
            }
            setCreateStatus(`Gruppe „${created.name}“ erstellt.`);
        } catch (error) {
            setCreateStatus(error instanceof Error ? error.message : "Gruppe konnte nicht erstellt werden.");
        } finally {
            setCreateBusy(false);
        }
    }

    return (
        <div>
            <div className="text-sm font-medium">{label}</div>

            <div className="mt-2 flex flex-wrap gap-2">
                {showAllOption ? (
                    <button
                        type="button"
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${allActive
                            ? "border-accent bg-accent-success-soft text-primary"
                            : "border-soft bg-surface hover:bg-surface-elevated"
                            }`}
                        onClick={onSelectAll}
                    >
                        {allLabel}
                    </button>
                ) : null}

                {groups.map((group) => {
                    const isSelected = selectedSet.has(group.id);
                    const isAssigned = assignedSet.has(group.id);
                    return (
                        <button
                            type="button"
                            key={group.id}
                            className={`rounded-full border px-2 py-1 text-xs transition ${isSelected
                                ? "border-accent bg-accent-success-soft"
                                : "border-soft bg-surface hover:bg-surface-elevated"
                                }`}
                            onClick={() => toggle(group.id)}
                            aria-pressed={isSelected}
                            title={isAssigned ? "Bereits zugeordnet" : undefined}
                        >
                            <span className="inline-flex items-center gap-1">
                                {isSelected ? <span aria-hidden="true">✓</span> : null}
                                <GroupBadge group={group} />
                                {isAssigned && !isSelected ? <span className="text-[10px] text-muted">(bereits)</span> : null}
                            </span>
                        </button>
                    );
                })}
            </div>

            {groups.length === 0 ? <p className="mt-2 text-sm text-muted">{emptyText}</p> : null}

            {allowCreate ? (
                <div className="mt-3 rounded-xl border border-soft p-3">
                    <div className="text-xs font-semibold text-muted">Neue Gruppe erstellen</div>
                    <div className="mt-2 flex gap-2">
                        <input
                            className="flex-1 rounded-lg border px-3 py-2 text-sm"
                            value={newGroupName}
                            onChange={(event) => setNewGroupName(event.target.value)}
                            placeholder="z.B. Begrüßung"
                        />
                        <button
                            type="button"
                            className="rounded-lg border px-3 py-2 text-sm"
                            onClick={handleCreate}
                            disabled={createBusy}
                        >
                            {createBusy ? "Erstelle…" : "Erstellen"}
                        </button>
                    </div>
                    {createStatus ? <p className="mt-2 text-xs text-muted">{createStatus}</p> : null}
                </div>
            ) : null}
        </div>
    );
}
