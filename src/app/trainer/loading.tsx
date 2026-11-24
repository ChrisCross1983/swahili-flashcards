import TrainerDashboardSkeleton from "@/components/trainer/TrainerDashboardSkeleton";
import { getTrainerCopy } from "@/lib/trainer/trainerCopy";

function DashboardCardPlaceholder({ label }: { label: string }) {
  return (
    <section className="flex min-h-[250px] flex-col rounded-[28px] border border-soft bg-surface p-6 shadow-soft sm:p-7 md:min-h-[280px]" aria-label={`${label} wird vorbereitet`}>
      <span className="h-10 w-10 rounded-xl bg-surface-elevated motion-safe:animate-pulse" aria-hidden="true" />
      <span className="mt-6 h-3 w-16 rounded bg-surface-strong motion-safe:animate-pulse" aria-hidden="true" />
      <span className="mt-3 h-6 w-3/4 rounded bg-surface-strong motion-safe:animate-pulse" aria-hidden="true" />
      <span className="mt-3 h-3 w-full rounded bg-surface-strong motion-safe:animate-pulse" aria-hidden="true" />
      <span className="mt-2 h-3 w-3/5 rounded bg-surface-strong motion-safe:animate-pulse" aria-hidden="true" />
      <span className="mt-auto h-5 w-16 rounded bg-surface-elevated motion-safe:animate-pulse" aria-hidden="true" />
    </section>
  );
}

export default function TrainerLoading() {
  return (
    <main className="min-h-screen bg-base px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-2xl font-semibold tracking-tight">{getTrainerCopy("vocab").trainerTitle}</h1>
        <div className="mt-5 h-11 w-full max-w-xs rounded-xl bg-surface-elevated motion-safe:animate-pulse" aria-hidden="true" />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5" aria-label="Trainer wird vorbereitet">
          <section className="flex min-h-[250px] flex-col rounded-[28px] border border-soft bg-surface p-6 shadow-soft sm:p-7 md:min-h-[280px]">
            <div className="flex items-center justify-between"><span className="h-10 w-10 rounded-xl bg-surface-elevated motion-safe:animate-pulse" aria-hidden="true" /><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-cta">Training</span></div>
            <TrainerDashboardSkeleton />
          </section>
          <DashboardCardPlaceholder label="Neue Wörter" />
          <DashboardCardPlaceholder label="Meine Karten" />
          <DashboardCardPlaceholder label="Bulk Import" />
        </div>
      </div>
    </main>
  );
}
