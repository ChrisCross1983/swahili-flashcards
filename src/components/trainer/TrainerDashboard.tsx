import type { ReactNode } from "react";

type Props = {
    todayDue: number;
    isSentenceTrainer: boolean;
    createLabel: string;
    createHint: string;
    cardsLabel: string;
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
    const { todayDue, isSentenceTrainer, createLabel, createHint, cardsLabel, onOpenLearn, onOpenCreate, onOpenCards, onOpenImport, importVisible } = props;

    return (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Tile
                title={todayDue > 0 ? "Heute lernen" : "Weiterlernen"}
                subtitle={todayDue > 0 ? `${todayDue} ${isSentenceTrainer ? "Sätze" : "Karten"} warten auf dich.` : "Direkt starten mit einer sinnvollen Standard-Session."}
                badge={<span className="text-accent-cta">Training</span>}
                onClick={onOpenLearn}
            />
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
