import type { Group } from "@/lib/groups/types";
import GroupColorDot from "@/components/groups/GroupColorDot";

export default function GroupBadge({ group, quiet = false }: { group: Pick<Group, "name" | "color">; quiet?: boolean }) {
    return (
        <span
            className={quiet
                ? "inline-flex h-5 min-w-0 max-w-[min(12rem,52vw)] items-center rounded-full border border-soft bg-surface/70 px-2 text-[11px] font-medium tracking-wide text-muted"
                : "inline-flex h-6 items-center rounded-full border border-strong bg-surface px-2.5 text-[11px] font-semibold tracking-wide text-primary shadow-soft"}
            data-role="group-badge"
            data-interactive="false"
            title={group.name}
        >
            <GroupColorDot color={group.color} className="mr-1.5" />
            <span className={quiet ? "truncate" : ""}>{group.name}</span>
        </span>
    );
}
