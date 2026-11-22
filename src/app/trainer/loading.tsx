import TrainerDashboardSkeleton from "@/components/trainer/TrainerDashboardSkeleton";
import { getTrainerCopy } from "@/lib/trainer/trainerCopy";

export default function TrainerLoading() {
  return (
    <main className="min-h-screen bg-base p-6 flex justify-center">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">{getTrainerCopy("vocab").trainerTitle}</h1>
        <div className="mt-3 h-11 w-full max-w-xs rounded-xl bg-surface-elevated motion-safe:animate-pulse" aria-hidden="true" />
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2"><TrainerDashboardSkeleton /></div>
      </div>
    </main>
  );
}
