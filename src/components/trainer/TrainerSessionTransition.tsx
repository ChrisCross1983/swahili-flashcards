export default function TrainerSessionTransition() {
    return (
        <div
            className="mt-4 flex min-h-[55dvh] items-center justify-center rounded-2xl border bg-surface p-6 text-center shadow-soft"
            role="status"
            aria-live="polite"
        >
            <div className="max-w-xs">
                <div className="mx-auto h-2 w-16 overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full w-8 rounded-full bg-accent-cta motion-safe:animate-pulse" />
                </div>
                <div className="mt-4 text-base font-semibold text-primary">
                    Heute lernen wird vorbereitet …
                </div>
                <div className="mt-2 text-sm text-muted">
                    Deine Karten werden geladen.
                </div>
            </div>
        </div>
    );
}
