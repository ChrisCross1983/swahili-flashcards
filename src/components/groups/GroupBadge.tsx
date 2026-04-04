import type { Group } from "@/lib/groups/types";

export default function GroupBadge({ group }: { group: Pick<Group, "name" | "color"> }) {
    const style = group.color
        ? {
            borderColor: `${group.color}66`,
            backgroundColor: `${group.color}1A`,
            color: group.color,
        }
        : undefined;

    return (
        <span className="inline-flex h-6 items-center rounded-full border border-soft px-2.5 text-[11px] font-medium tracking-wide" style={style}>
            {group.name}
        </span>
    );
}
