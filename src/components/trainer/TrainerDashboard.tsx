import type { ReactNode } from "react";
import TrainerDashboardSkeleton from "./TrainerDashboardSkeleton";

type Props = {
    countsState: "pending" | "ready" | "error";
    todayDue: number;
    totalCards: number;
    lastMissedCount: number;
    isSentenceTrainer: boolean;
    createLabel: string;
    createHint: string;
    cardsLabel: string;
    onStartLearning: () => void;
    onOpenLearn: () => void;
    onOpenCreate: () => void;
    onOpenCards: () => void;
    onOpenImport: () => void;
    onRetryCounts: () => void;
    importVisible: boolean;
};

function Tile({ title, subtitle, badge, onClick }: { title: string; subtitle: string; badge: ReactNode; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="rounded-[32px] border bg-surface p-8 text-left shadow-soft hover:shadow-warm transition"
        >
            <div className="text-xs font-semibold uppercase tracking-[0.12em]">{badge}</div>
            <div className="mt-2 text-xl font-semibold">{title}</div>
            <div className="mt-2 text-sm text-muted">{subtitle}</div>
        </button>
    );
}

export default function TrainerDashboard(props: Props) {
    const {
        countsState,
        todayDue,
        totalCards,
        lastMissedCount,
        isSentenceTrainer,
        createLabel,
        createHint,
        cardsLabel,
        onStartLearning,
        onOpenLearn,
        onOpenCreate,
        onOpenCards,
        onOpenImport,
        onRetryCounts,
        importVisible,
    } = props;
    const itemLabel = isSentenceTrainer ? "Sätze" : "Karten";
    const learningTitle = countsState === "ready" ? todayDue > 0 ? "Heute lernen" : "Weiterlernen" : "Training";
    const learningSubtitle = todayDue > 0
        ? `Starte mit den nächsten ${itemLabel}. ${todayDue} sind heute dran.`
        : lastMissedCount > 0
            ? `Kleine Wiederholung: ${lastMissedCount} zuletzt nicht gewusste ${itemLabel}.`
            : totalCards > 0
                ? "Direkt mit einer kleinen Standardrunde starten."
                : `Lege zuerst ${isSentenceTrainer ? "Sätze" : "Karten"} an.`;

    return (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {countsState === "pending" ? <TrainerDashboardSkeleton onOpenLearn={onOpenLearn} /> : <div className="rounded-[32px] border bg-surface p-8 text-left shadow-soft transition hover:shadow-warm">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-cta">Training</div>
                <div className="mt-2 text-xl font-semibold">{learningTitle}</div>
                <div className="mt-2 min-h-12 text-sm text-muted">
                    {countsState === "error" ? "Lernzahlen konnten nicht geladen werden." : learningSubtitle}
                </div>
                <button
                    type="button"
                    className="mt-5 min-h-14 w-full btn btn-primary py-3 text-base"
                    onClick={countsState === "error" ? onRetryCounts : onStartLearning}
                >
                    {countsState === "error" ? "Erneut prüfen" : todayDue > 0 ? "Heute lernen starten" : "Weiterlernen starten"}
                </button>
                <button
                    type="button"
                    className="mt-2 w-full btn btn-ghost py-2 text-sm"
                    onClick={onOpenLearn}
                >
                    Anpassen
                </button>
            </div>}
            <Tile
                title={createLabel}
                subtitle={createHint}
                badge={<span className="text-accent-primary-strong">Erstellen</span>}
                onClick={onOpenCreate}
            />
            <Tile
                title={cardsLabel}
                subtitle="Durchsuchen, bearbeiten und aufräumen."
                badge={<span className="text-accent-secondary">Verwalten</span>}
                onClick={onOpenCards}
            />
            {importVisible ? (
                <Tile
                    title="📥 Bulk Import"
                    subtitle="Vokabelliste einfügen, prüfen und importieren."
                    badge={<span className="text-accent-primary-strong">Import</span>}
                    onClick={onOpenImport}
                />
            ) : null}
        </div>
    );
}
