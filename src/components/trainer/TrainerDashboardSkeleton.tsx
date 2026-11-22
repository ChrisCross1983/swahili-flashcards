type Props = { onOpenLearn?: () => void };

export default function TrainerDashboardSkeleton({ onOpenLearn }: Props) {
    return <div className="rounded-[32px] border border-soft bg-surface p-8 text-left shadow-soft" data-testid="trainer-dashboard-skeleton" role="status" aria-label="Lernzahlen werden ermittelt">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-cta">Training</div>
        <div className="mt-2 min-h-7 text-xl font-semibold">Training</div>
        <div className="mt-2 min-h-12 space-y-2 pt-0.5" aria-hidden="true">
            <div className="h-3.5 w-4/5 rounded bg-surface-strong motion-safe:animate-pulse" />
            <div className="h-3.5 w-2/5 rounded bg-surface-elevated motion-safe:animate-pulse" />
        </div>
        <button type="button" disabled aria-label="Lernkarten werden ermittelt" className="btn btn-secondary mt-5 min-h-14 w-full py-3 text-base">
            <span className="h-3.5 w-2/5 rounded bg-surface-strong motion-safe:animate-pulse" aria-hidden="true" />
        </button>
        <button type="button" disabled={!onOpenLearn} className="btn btn-ghost mt-2 w-full py-2 text-sm" onClick={onOpenLearn}>Anpassen</button>
    </div>;
}
