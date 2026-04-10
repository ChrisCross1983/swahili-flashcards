import type { Group } from "@/lib/groups/types";

export default function GroupBadge({ group }: { group: Pick<Group, "name" | "color"> }) {
    const style = group.color
        ? {
            borderColor: `${group.color}66`,
            backgroundColor: `${group.color}22`,
            color: group.color,
        }
        : undefined;

    return (
        <span className="inline-flex h-6 items-center rounded-full border border-strong bg-surface px-2.5 text-[11px] font-semibold tracking-wide text-primary shadow-soft" style={style}>
            {group.name}
        </span>
    );
}
