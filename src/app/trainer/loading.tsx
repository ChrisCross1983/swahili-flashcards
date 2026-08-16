import AppRouteState from "@/components/AppRouteState";

export default function TrainerLoading() {
  return (
    <AppRouteState
      eyebrow="Training"
      title="Training wird vorbereitet"
      description="Deine Lernkarten und Einstellungen werden geladen. Gleich kannst du weitermachen."
    >
      <div className="w-full space-y-3">
        <div className="h-20 rounded-2xl border border-soft bg-surface-elevated motion-safe:animate-pulse" />
        <div className="h-12 rounded-xl border border-soft bg-surface-elevated motion-safe:animate-pulse" />
      </div>
    </AppRouteState>
  );
}
