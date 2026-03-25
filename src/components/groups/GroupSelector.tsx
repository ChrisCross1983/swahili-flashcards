"use client";

import type { Group } from "@/lib/groups/types";
import GroupBadge from "@/components/groups/GroupBadge";

type Props = {
    groups: Group[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    label?: string;
    emptyText?: string;
};

export default function GroupSelector({ groups, selectedIds, onChange, label = "Gruppen", emptyText = "Noch keine Gruppen." }: Props) {
    const selectedSet = new Set(selectedIds);

    function toggle(id: string) {
        if (selectedSet.has(id)) {
            onChange(selectedIds.filter((value) => value !== id));
            return;
        }
        onChange([...selectedIds, id]);
    }

    return (
        <div>
            <div className="text-sm font-medium">{label}</div>
            {groups.length === 0 ? <p className="mt-2 text-sm text-muted">{emptyText}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
                {groups.map((group) => (
                    <button
                        type="button"
                        key={group.id}
                        className={`rounded-full border px-2 py-1 text-xs ${selectedSet.has(group.id) ? "border-accent" : "border-soft"}`}
                        onClick={() => toggle(group.id)}
                    >
                        <GroupBadge group={group} />
                    </button>
                ))}
            </div>
        </div>
    );
}
