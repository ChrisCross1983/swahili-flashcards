export default function TrainerDashboardSkeleton() {
    return <div className="mt-6 flex min-h-0 flex-1 flex-col" data-testid="trainer-dashboard-skeleton" role="status" aria-label="Lernzahlen werden ermittelt">
        <div className="h-7 w-36 rounded-md bg-surface-strong motion-safe:animate-pulse" aria-hidden="true" />
        <div className="mt-3 space-y-2" aria-hidden="true"><div className="h-3.5 w-full rounded bg-surface-strong motion-safe:animate-pulse" /><div className="h-3.5 w-3/5 rounded bg-surface-strong motion-safe:animate-pulse" /></div>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-accent-primary-strong"><span className="h-1.5 w-1.5 rounded-full bg-accent-cta motion-safe:animate-pulse" />Lernzahlen werden vorbereitet</div>
        <div className="mt-auto space-y-2 pt-5"><button type="button" disabled aria-label="Lernkarten werden ermittelt" className="min-h-14 w-full rounded-xl bg-surface-strong motion-safe:animate-pulse" /><div className="h-10 w-full rounded-xl bg-surface-elevated" aria-hidden="true" /></div>
    </div>;
}
