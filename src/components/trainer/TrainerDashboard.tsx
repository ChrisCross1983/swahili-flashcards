import TrainerDashboardSkeleton from "./TrainerDashboardSkeleton";

type Props = { countsState: "pending" | "ready" | "error"; todayDue: number; totalCards: number; lastMissedCount: number; isSentenceTrainer: boolean; createLabel: string; createHint: string; cardsLabel: string; onStartLearning: () => void; onOpenLearn: () => void; onOpenCreate: () => void; onOpenCards: () => void; onOpenImport: () => void; onRetryCounts: () => void; importVisible: boolean };
type IconName = "learn" | "create" | "library" | "import";

function DashboardIcon({ name }: { name: IconName }) {
    const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        {name === "learn" ? <><path {...common} d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path {...common} d="M4 5.5v16M8 7h8M8 11h6" /></> : null}
        {name === "create" ? <><path {...common} d="M12 20h9" /><path {...common} d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z" /></> : null}
        {name === "library" ? <><rect {...common} x="4" y="4" width="16" height="16" rx="2" /><path {...common} d="M8 8h8M8 12h8M8 16h5" /></> : null}
        {name === "import" ? <><path {...common} d="M12 3v12M7 10l5 5 5-5" /><path {...common} d="M5 19h14" /></> : null}
    </svg>;
}

function ActionCard({ eyebrow, title, subtitle, icon, testId, onClick }: { eyebrow: string; title: string; subtitle: string; icon: IconName; testId: string; onClick: () => void }) {
    return <button type="button" data-testid={testId} onClick={onClick} className="group flex min-h-[250px] flex-col rounded-[28px] border border-soft bg-surface p-6 text-left shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-strong hover:shadow-warm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--accent-cta)] active:translate-y-0 sm:p-7 md:min-h-[280px]">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-soft bg-surface-elevated text-accent-primary-strong transition group-hover:bg-accent-cta group-hover:text-on-accent"><DashboardIcon name={icon} /></span>
        <span className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</span><span className="mt-2 text-xl font-semibold tracking-tight text-primary">{title}</span><span className="mt-2 text-sm leading-6 text-muted">{subtitle}</span>
        <span className="mt-auto pt-5 text-sm font-semibold text-accent-primary-strong">Öffnen <span aria-hidden="true">→</span></span>
    </button>;
}

export default function TrainerDashboard(props: Props) {
    const { countsState, todayDue, totalCards, lastMissedCount, isSentenceTrainer, createLabel, createHint, cardsLabel, onStartLearning, onOpenLearn, onOpenCreate, onOpenCards, onOpenImport, onRetryCounts, importVisible } = props;
    const itemLabel = isSentenceTrainer ? "Sätze" : "Karten";
    const subtitle = todayDue > 0 ? `Starte mit den nächsten ${itemLabel}. ${todayDue} sind heute dran.` : lastMissedCount > 0 ? `Kleine Wiederholung: ${lastMissedCount} zuletzt nicht gewusste ${itemLabel}.` : totalCards > 0 ? "Direkt mit einer kleinen Standardrunde starten." : `Lege zuerst ${isSentenceTrainer ? "Sätze" : "Karten"} an.`;
    return <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5" aria-label="Trainer-Navigation">
        <section data-testid="trainer-dashboard-training-card" className="flex min-h-[250px] flex-col rounded-[28px] border border-soft bg-surface p-6 shadow-soft sm:p-7 md:min-h-[280px]" aria-labelledby="trainer-dashboard-training">
            <div className="flex items-center justify-between gap-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-soft bg-surface-elevated text-accent-primary-strong"><DashboardIcon name="learn" /></span><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-cta">Training</span></div>
            {countsState === "pending" ? <><h2 id="trainer-dashboard-training" className="mt-6 text-xl font-semibold tracking-tight text-primary">Training wird vorbereitet</h2><TrainerDashboardSkeleton /></> : <><h2 id="trainer-dashboard-training" className="mt-6 text-xl font-semibold tracking-tight text-primary">{countsState === "error" ? "Training prüfen" : todayDue > 0 ? "Heute lernen" : "Weiterlernen"}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-muted">{countsState === "error" ? "Lernzahlen konnten nicht geladen werden." : subtitle}</p><div className="mt-4 text-sm font-semibold text-accent-primary-strong">{countsState === "ready" ? `${todayDue} heute fällig · ${totalCards} insgesamt` : "Verbindung erneut prüfen"}</div><div className="mt-auto grid gap-2 pt-5"><button type="button" className="btn btn-primary min-h-14 w-full" onClick={countsState === "error" ? onRetryCounts : onStartLearning}>{countsState === "error" ? "Erneut prüfen" : todayDue > 0 ? "Heute lernen starten" : "Weiterlernen starten"}</button><button type="button" className="btn btn-ghost min-h-10 w-full text-sm" onClick={onOpenLearn}>Training anpassen</button></div></>}
        </section>
        <ActionCard eyebrow="Erstellen" title={createLabel} subtitle={createHint} icon="create" testId="trainer-dashboard-create-card" onClick={onOpenCreate} />
        <ActionCard eyebrow="Verwalten" title={cardsLabel} subtitle="Durchsuchen, bearbeiten und aufräumen." icon="library" testId="trainer-dashboard-library-card" onClick={onOpenCards} />
        {importVisible ? <ActionCard eyebrow="Import" title="Bulk Import" subtitle="Vokabelliste einfügen, prüfen und importieren." icon="import" testId="trainer-dashboard-import-card" onClick={onOpenImport} /> : null}
    </section>;
}
