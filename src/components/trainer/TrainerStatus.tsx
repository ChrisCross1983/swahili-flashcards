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
        <div className="mb-3 rounded-2xl border border-soft bg-surface/80 px-3 py-2.5 text-sm shadow-none" data-testid="trainer-session-status" data-tone="secondary">
            <div className="flex items-center justify-between gap-3">
                <div className="text-muted">
                    Karte <span className="font-medium text-primary">{currentNumber}</span> von{" "}
                    <span className="font-medium text-primary">{sessionTotal}</span>
                </div>

                <div className="rounded-full border border-soft bg-surface px-2.5 py-1 text-xs text-muted">
                    ✔︎ <span className="font-medium">{answeredCount === 0 ? "—" : `${safePct}%`}</span>{" "}
                    <span className="text-muted">sicher</span>
                </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-xs text-muted">
                    Richtung:{" "}
                    <span className="font-medium text-primary">
                        {directionMode === "RANDOM"
                            ? "Zufällig (Abwechslung)"
                            : direction === "DE_TO_SW"
                                ? "Deutsch → Swahili"
                                : "Swahili → Deutsch"}
                    </span>
                </div>

                <button type="button" className="btn btn-utility px-2.5 py-1 text-xs whitespace-nowrap" onClick={onToggleDirectionMenu}>
                    Richtung ändern
                </button>
            </div>
        </div>
    );
}
