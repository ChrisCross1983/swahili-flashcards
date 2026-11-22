import type { Direction } from "@/lib/trainer/types";
import { SentenceFeatureIcon } from "@/components/trainer/SentenceFormDisclosure";

type Props = {
    currentNumber: number;
    sessionTotal: number;
    answeredCount: number;
    safePct: number;
    direction: Direction;
    directionMode: "DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null;
    onToggleDirectionMenu: () => void;
    onEditCard?: () => void;
};

export default function TrainerStatus({
    currentNumber,
    sessionTotal,
    answeredCount,
    safePct,
    direction,
    directionMode,
    onToggleDirectionMenu,
    onEditCard,
}: Props) {
    return (
        <div className="min-w-0 rounded-2xl border border-soft bg-surface px-3 py-2.5 text-sm shadow-soft" data-testid="trainer-session-status" data-tone="secondary">
            <div className="flex min-w-0 items-center gap-2">
                <div className="shrink-0 font-semibold tabular-nums text-primary">
                    {currentNumber} <span className="font-normal text-muted">/</span> {sessionTotal}
                </div>

                <div className="rounded-full border border-soft bg-surface-elevated px-2.5 py-1 text-xs text-muted">
                    ✔︎ <span className="font-medium">{answeredCount === 0 ? "—" : `${safePct}%`}</span>{" "}
                    <span className="text-muted">sicher</span>
                </div>
                {onEditCard ? <button type="button" onClick={onEditCard} aria-label="Karte bearbeiten" title="Karte bearbeiten"
                    data-card-option-action="edit" className="ml-auto inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-soft bg-surface-elevated text-muted transition hover:border-[color:var(--accent-primary)] hover:text-primary active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)]">
                    <SentenceFeatureIcon name="edit" className="h-4 w-4" />
                </button> : null}
            </div>

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t border-soft pt-2">
                <div className="min-w-0 text-xs text-muted">
                    Richtung:{" "}
                    <span className="font-medium text-primary">
                        {directionMode === "RANDOM"
                            ? "Zufällig"
                            : direction === "DE_TO_SW"
                                ? "Deutsch → Swahili"
                                : "Swahili → Deutsch"}
                    </span>
                </div>

                <button type="button" className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg px-2 py-1.5 text-xs font-medium text-accent-cta-strong hover:bg-accent-cta-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)]" onClick={onToggleDirectionMenu}>
                    Richtung ändern
                </button>
            </div>
        </div>
    );
}
