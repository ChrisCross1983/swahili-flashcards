"use client";

import { useMemo, useState } from "react";
import FullScreenSheet from "@/components/FullScreenSheet";
import type { Group } from "@/lib/groups/types";
import { createGroup, deleteGroup, updateGroup } from "@/lib/groups/api";
import type { CardType } from "@/lib/trainer/types";

type Props = {
    open: boolean;
    groups: Group[];
    groupCardCounts?: Record<string, number>;
    onClose: () => void;
    onUpdated: (groups: Group[]) => void;
    onOpenGroup?: (groupId: string) => void;
    cardType: CardType;
};

export default function ManageGroupsSheet({
    open,
    groups,
    groupCardCounts = {},
    onClose,
    onUpdated,
    onOpenGroup,
    cardType,
}: Props) {
    const [name, setName] = useState("");
    const [status, setStatus] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");

    const sortedGroups = useMemo(
        () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
        [groups]
    );

    async function onCreate() {
        const trimmed = name.trim();
        if (!trimmed) {
            setStatus("Bitte Gruppennamen eingeben.");
            return;
        }

        setBusyId("create");
        setStatus("");

        try {
            const group = await createGroup(cardType, { name: trimmed });
            onUpdated([...groups, group]);
            setName("");
            setStatus(`Gruppe „${group.name}“ erstellt.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Fehler beim Erstellen.");
        } finally {
            setBusyId(null);
        }
    }

    function startRename(group: Group) {
        setEditingId(group.id);
        setEditingName(group.name);
        setStatus("");
    }

    async function submitRename(group: Group) {
        const trimmed = editingName.trim();
        if (!trimmed) {
            setStatus("Name darf nicht leer sein.");
            return;
        }

        if (trimmed === group.name) {
            setStatus("Keine Änderung am Namen.");
            setEditingId(null);
            return;
        }

        setBusyId(group.id);
        setStatus("");
        try {
            const updated = await updateGroup(cardType, group.id, { name: trimmed });
            onUpdated(groups.map((entry) => (entry.id === updated.id ? updated : entry)));
            setEditingId(null);
            setStatus(`Gruppe umbenannt: ${updated.name}.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Fehler beim Umbenennen.");
        } finally {
            setBusyId(null);
        }
    }

    async function onDelete(group: Group) {
        const ok = confirm(`Gruppe „${group.name}“ wirklich löschen?`);
        if (!ok) return;

        setBusyId(group.id);
        setStatus("");

        try {
            await deleteGroup(group.id);
            onUpdated(groups.filter((entry) => entry.id !== group.id));
            setStatus(`Gruppe „${group.name}“ gelöscht.`);
            if (editingId === group.id) {
                setEditingId(null);
            }
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Fehler beim Löschen.");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <FullScreenSheet open={open} title="Gruppen verwalten" onClose={onClose}>
            <div className="rounded-2xl border p-4 space-y-3">
                <div className="text-sm font-medium">Neue Gruppe</div>
                <div className="flex gap-2">
                    <input
                        className="flex-1 rounded-xl border px-3 py-2"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="z.B. Begrüßung"
                    />
                    <button type="button" className="rounded-xl border px-3 py-2" onClick={onCreate} disabled={busyId === "create"}>
                        {busyId === "create" ? "Anlegen…" : "Anlegen"}
                    </button>
                </div>
                {status ? <p className="text-sm text-muted">{status}</p> : null}
            </div>

            <div className="mt-4 space-y-2">
                {sortedGroups.map((group) => {
                    const count = Number(groupCardCounts[group.id] ?? 0);
                    const isEditing = editingId === group.id;
                    const isBusy = busyId === group.id;

                    return (
                        <div key={group.id} className="rounded-xl border p-3 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    {isEditing ? (
                                        <input
                                            className="rounded-lg border px-2 py-1 text-sm"
                                            value={editingName}
                                            onChange={(event) => setEditingName(event.target.value)}
                                        />
                                    ) : (
                                        <div className="font-medium">{group.name}</div>
                                    )}
                                    <p className="text-xs text-muted mt-1">{count} Karten</p>
                                </div>

                                <div className="flex flex-wrap gap-2 justify-end">
                                    <button
                                        type="button"
                                        className="rounded-lg border px-2 py-1 text-sm"
                                        onClick={() => onOpenGroup?.(group.id)}
                                    >
                                        Öffnen
                                    </button>

                                    {isEditing ? (
                                        <>
                                            <button
                                                type="button"
                                                className="rounded-lg border px-2 py-1 text-sm"
                                                onClick={() => submitRename(group)}
                                                disabled={isBusy}
                                            >
                                                Speichern
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-lg border px-2 py-1 text-sm"
                                                onClick={() => setEditingId(null)}
                                            >
                                                Abbrechen
                                            </button>
                                        </>
                                    ) : (
                                        <button type="button" className="rounded-lg border px-2 py-1 text-sm" onClick={() => startRename(group)}>
                                            Umbenennen
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className="rounded-lg border px-2 py-1 text-sm"
                                        onClick={() => onDelete(group)}
                                        disabled={isBusy}
                                    >
                                        {isBusy ? "Löschen…" : "Löschen"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {groups.length === 0 ? <p className="text-sm text-muted">Du hast noch keine Gruppen.</p> : null}
            </div>
        </FullScreenSheet>
    );
}
