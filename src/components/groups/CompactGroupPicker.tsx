"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
    const panelId = useId();
    const [open, setOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [createStatus, setCreateStatus] = useState<string | null>(null);
    const [createBusy, setCreateBusy] = useState(false);
    const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

    useEffect(() => {
        if (!open) return;

        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            const panel = document.getElementById(panelId);
            if (
                containerRef.current &&
                !containerRef.current.contains(target) &&
                panel &&
                !panel.contains(target)
            ) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open, panelId]);

    useEffect(() => {
        if (!open) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
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
                aria-controls={open ? panelId : undefined}
            >
                {triggerLabel}
            </button>

            {open ? (
                <div
                    id={panelId}
                    className="fixed inset-x-3 top-[max(4.5rem,calc(env(safe-area-inset-top)+1rem))] z-[135] max-h-[calc(100dvh-6rem)] overflow-auto rounded-2xl border border-soft bg-base p-3 shadow-warm md:left-auto md:right-[max(1rem,env(safe-area-inset-right))] md:top-[max(5rem,calc(env(safe-area-inset-top)+2rem))] md:w-[min(24rem,calc(100vw-2rem))]"
                    data-viewport-safe-group-picker
                >
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
