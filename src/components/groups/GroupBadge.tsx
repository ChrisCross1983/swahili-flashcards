import type { Group } from "@/lib/groups/types";

export default function GroupBadge({ group, quiet = false }: { group: Pick<Group, "name" | "color">; quiet?: boolean }) {
    const style = group.color
        ? {
            borderColor: `${group.color}66`,
            backgroundColor: `${group.color}22`,
            color: group.color,
        }
        : undefined;

    return (
        <span
            className={quiet
                ? "inline-flex h-5 items-center rounded-full border border-soft bg-surface/70 px-2 text-[11px] font-medium tracking-wide text-muted"
                : "inline-flex h-6 items-center rounded-full border border-strong bg-surface px-2.5 text-[11px] font-semibold tracking-wide text-primary shadow-soft"}
            style={style}
            data-role="group-badge"
            data-interactive="false"
        >
            {group.name}
        </span>
    );
}
