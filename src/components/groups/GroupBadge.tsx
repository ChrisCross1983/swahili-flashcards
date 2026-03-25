import type { Group } from "@/lib/groups/types";

export default function GroupBadge({ group }: { group: Pick<Group, "name" | "color"> }) {
    const style = group.color ? { borderColor: group.color, color: group.color } : undefined;

    return (
        <span className="inline-flex rounded-full border border-soft bg-surface px-2 py-1 text-xs" style={style}>
            {group.name}
        </span>
    );
}
