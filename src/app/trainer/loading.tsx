import TrainerDashboard from "@/components/trainer/TrainerDashboard";
import { getTrainerCopy } from "@/lib/trainer/trainerCopy";

export default function TrainerLoading() {
  const copy = getTrainerCopy("vocab");
  return (
    <main className="min-h-screen bg-base px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-2xl font-semibold tracking-tight">{copy.trainerTitle}</h1>
        <div className="mt-5 h-11 w-full max-w-xs rounded-xl bg-surface-elevated" aria-hidden="true" />
        <TrainerDashboard countsState="pending" todayDue={0} totalCards={0} lastMissedCount={0} isSentenceTrainer={false} createLabel={copy.createLabel} createHint={copy.createHint} cardsLabel={copy.cardsLabel} importVisible interactionsEnabled={false} />
      </div>
    </main>
  );
}
