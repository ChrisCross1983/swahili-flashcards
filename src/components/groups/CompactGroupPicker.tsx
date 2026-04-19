"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "@/lib/groups/types";
import { createGroup } from "@/lib/groups/api";
import type { CardType } from "@/lib/trainer/types";

type Props = {
    groups: Group[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    cardType: CardType;
    triggerLabel?: string;
    title?: string;
    emptyText?: string;
    allowCreate?: boolean;
    onGroupCreated?: (group: Group) => void;
    autoSelectCreated?: boolean;
};

export default function CompactGroupPicker({
    groups,
    selectedIds,
    onChange,
    cardType,
    triggerLabel = "Gruppen wählen",
    title = "Gruppen auswählen",
    emptyText = "Noch keine Gruppen vorhanden.",
    allowCreate = false,
    onGroupCreated,
    autoSelectCreated = true,
}: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [createStatus, setCreateStatus] = useState<string | null>(null);
    const [createBusy, setCreateBusy] = useState(false);
    const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

    useEffect(() => {
        if (!open) return;

        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            if (containerRef.current && !containerRef.current.contains(target)) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

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
            const created = await createGroup(cardType, { name: trimmed });
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
        <div ref={containerRef} className="relative inline-flex">
            <button
                type="button"
                className="btn btn-ghost text-sm whitespace-nowrap"
                onClick={() => setOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                {triggerLabel}
            </button>

            {open ? (
                <div className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-3rem))] rounded-2xl border border-soft bg-base p-3 shadow-soft">
                    <div className="mb-2 text-sm font-semibold">{title}</div>
                    <div className="max-h-56 space-y-1 overflow-auto pr-1" role="listbox" aria-multiselectable="true">
                        {groups.map((group) => {
                            const isSelected = selectedSet.has(group.id);
                            return (
                                <button
                                    type="button"
                                    key={group.id}
                                    role="option"
                                    aria-selected={isSelected}
                                    className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-sm transition ${isSelected
                                        ? "border-cta bg-accent-cta-soft text-default"
                                        : "border-soft bg-surface hover:bg-surface-elevated"
                                        }`}
                                    onClick={() => toggle(group.id)}
                                >
                                    <span className="truncate">{group.name}</span>
                                    <span className="pl-2 text-xs" aria-hidden="true">{isSelected ? "✓" : ""}</span>
                                </button>
                            );
                        })}
                        {groups.length === 0 ? <p className="px-1 py-2 text-sm text-muted">{emptyText}</p> : null}
                    </div>

                    {allowCreate ? (
                        <div className="mt-3 border-t border-soft pt-3">
                            <div className="text-xs font-semibold tracking-wide text-muted">Neue Gruppe erstellen</div>
                            <div className="mt-2 flex gap-2">
                                <input
                                    className="flex-1 rounded-lg border border-soft bg-surface px-2.5 py-1.5 text-sm"
                                    value={newGroupName}
                                    onChange={(event) => setNewGroupName(event.target.value)}
                                    placeholder="z.B. Begrüßung"
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary rounded-lg px-3 py-1.5 text-sm"
                                    onClick={handleCreate}
                                    disabled={createBusy}
                                >
                                    {createBusy ? "…" : "Erstellen"}
                                </button>
                            </div>
                            {createStatus ? <p className="mt-2 text-xs text-muted">{createStatus}</p> : null}
                        </div>
                    ) : null}

                    <div className="mt-3 flex justify-end border-t border-soft pt-3">
                        <button type="button" className="btn btn-primary text-sm" onClick={() => setOpen(false)}>
                            Fertig
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
