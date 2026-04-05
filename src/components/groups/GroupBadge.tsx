import type { Group } from "@/lib/groups/types";

export default function GroupBadge({ group }: { group: Pick<Group, "name" | "color"> }) {
    const style = group.color
        ? {
            borderColor: `${group.color}55`,
            backgroundColor: `${group.color}14`,
            color: group.color,
        }
        : undefined;

    return (
        <span className="inline-flex h-6 items-center rounded-full border border-soft bg-surface px-2.5 text-[11px] font-medium text-muted" style={style}>
            {group.name}
        </span>
    );
}
