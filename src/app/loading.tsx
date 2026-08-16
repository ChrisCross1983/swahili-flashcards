import AppRouteState from "@/components/AppRouteState";

export default function Loading() {
  return (
    <AppRouteState
      eyebrow="Laden"
      title="Swahili wird vorbereitet"
      description="Die App lädt gerade deine Ansicht. Das dauert normalerweise nur einen Moment."
    >
      <div className="h-2 w-full overflow-hidden rounded-full border border-soft bg-surface-elevated sm:w-64">
        <div className="h-full w-20 rounded-full bg-accent-cta motion-safe:animate-pulse" />
      </div>
    </AppRouteState>
  );
}
