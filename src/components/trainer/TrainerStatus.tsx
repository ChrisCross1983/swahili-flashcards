import type { Direction } from "@/lib/trainer/types";

type Props = {
    currentNumber: number;
    sessionTotal: number;
    answeredCount: number;
    safePct: number;
    direction: Direction;
    directionMode: "DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null;
    onToggleDirectionMenu: () => void;
};

export default function TrainerStatus({
    currentNumber,
    sessionTotal,
    answeredCount,
    safePct,
    direction,
    directionMode,
    onToggleDirectionMenu,
}: Props) {
    return (
        <div className="mb-3">
            <div className="flex items-center justify-between">
                <div className="text-sm text-muted">
                    Karte <span className="font-medium text-primary">{currentNumber}</span> von{" "}
                    <span className="font-medium text-primary">{sessionTotal}</span>
                </div>

                <div className="rounded-full border px-3 py-1 text-sm text-muted bg-surface shadow-soft">
                    ✔︎ <span className="font-medium">{answeredCount === 0 ? "—" : `${safePct}%`}</span>{" "}
                    <span className="text-muted">sicher</span>
                </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-sm text-muted">
                    Richtung:{" "}
                    <span className="font-medium text-primary">
                        {directionMode === "RANDOM"
                            ? "Zufällig (Abwechslung)"
                            : direction === "DE_TO_SW"
                                ? "Deutsch → Swahili"
                                : "Swahili → Deutsch"}
                    </span>
                </div>

                <button type="button" className="btn btn-ghost text-sm whitespace-nowrap" onClick={onToggleDirectionMenu}>
                    Richtung ändern
                </button>
            </div>
        </div>
    );
}
