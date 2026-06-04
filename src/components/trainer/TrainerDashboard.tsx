import type { ReactNode } from "react";

type Props = {
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
        importVisible,
    } = props;
    const itemLabel = isSentenceTrainer ? "Sätze" : "Karten";
    const learningTitle = todayDue > 0 ? "Heute lernen" : "Weiterlernen";
    const learningSubtitle = todayDue > 0
        ? `${todayDue} ${itemLabel} warten auf dich.`
        : lastMissedCount > 0
            ? `${lastMissedCount} zuletzt nicht gewusste ${itemLabel} kurz wiederholen.`
            : totalCards > 0
                ? "Direkt starten mit einer sinnvollen Standard-Session."
                : `Lege zuerst ${isSentenceTrainer ? "Sätze" : "Karten"} an.`;

    return (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="rounded-[32px] border bg-surface p-8 text-left shadow-soft transition hover:shadow-warm">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-cta">Training</div>
                <div className="mt-2 text-xl font-semibold">{learningTitle}</div>
                <div className="mt-2 text-sm text-muted">{learningSubtitle}</div>
                <button
                    type="button"
                    className="mt-5 w-full btn btn-primary py-3 text-base"
                    onClick={onStartLearning}
                >
                    Heute lernen starten
                </button>
                <button
                    type="button"
                    className="mt-2 w-full btn btn-ghost py-2 text-sm"
                    onClick={onOpenLearn}
                >
                    Anpassen
                </button>
            </div>
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
