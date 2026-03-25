"use client";

import { useState } from "react";
import FullScreenSheet from "@/components/FullScreenSheet";
import type { Group } from "@/lib/groups/types";
import { createGroup, deleteGroup, updateGroup } from "@/lib/groups/api";

type Props = {
    open: boolean;
    groups: Group[];
    onClose: () => void;
    onUpdated: (groups: Group[]) => void;
};

export default function ManageGroupsSheet({ open, groups, onClose, onUpdated }: Props) {
    const [name, setName] = useState("");
    const [status, setStatus] = useState("");

    async function onCreate() {
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
            const group = await createGroup({ name: trimmed });
            onUpdated([...groups, group].sort((a, b) => a.name.localeCompare(b.name)));
            setName("");
            setStatus("Gruppe erstellt.");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Fehler.");
        }
    }

    async function onRename(group: Group) {
        const nextName = prompt("Neuer Name", group.name);
        if (!nextName || nextName.trim() === group.name) return;
        try {
            const updated = await updateGroup(group.id, { name: nextName.trim() });
            onUpdated(groups.map((entry) => (entry.id === updated.id ? updated : entry)).sort((a, b) => a.name.localeCompare(b.name)));
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Fehler.");
        }
    }

    async function onDelete(group: Group) {
        const ok = confirm(`Gruppe „${group.name}“ löschen?`);
        if (!ok) return;
        try {
            await deleteGroup(group.id);
            onUpdated(groups.filter((entry) => entry.id !== group.id));
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Fehler.");
        }
    }

    return (
        <FullScreenSheet open={open} title="Gruppen verwalten" onClose={onClose}>
            <div className="rounded-2xl border p-4 space-y-3">
                <div className="text-sm font-medium">Neue Gruppe</div>
                <div className="flex gap-2">
                    <input className="flex-1 rounded-xl border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Begrüßung" />
                    <button type="button" className="rounded-xl border px-3 py-2" onClick={onCreate}>Anlegen</button>
                </div>
                {status ? <p className="text-sm text-muted">{status}</p> : null}
            </div>

            <div className="mt-4 space-y-2">
                {groups.map((group) => (
                    <div key={group.id} className="rounded-xl border p-3 flex items-center justify-between gap-2">
                        <div>{group.name}</div>
                        <div className="flex gap-2">
                            <button type="button" className="rounded-lg border px-2 py-1 text-sm" onClick={() => onRename(group)}>Umbenennen</button>
                            <button type="button" className="rounded-lg border px-2 py-1 text-sm" onClick={() => onDelete(group)}>Löschen</button>
                        </div>
                    </div>
                ))}
                {groups.length === 0 ? <p className="text-sm text-muted">Du hast noch keine Gruppen.</p> : null}
            </div>
        </FullScreenSheet>
    );
}
