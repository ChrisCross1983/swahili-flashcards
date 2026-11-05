import { resolveGroupColor } from "@/lib/groups/colors";

export default function GroupColorDot({ color, className = "" }: { color: string | null | undefined; className?: string }) {
    const selected = resolveGroupColor(color);
    return <span
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 ${className}`}
        style={{ backgroundColor: selected.hex }}
        aria-hidden="true"
        data-group-color={selected.key}
    />;
}
