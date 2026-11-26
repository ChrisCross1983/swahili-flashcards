"use client";

import Link from "next/link";

type Props = {
    countsState: "pending" | "ready" | "error";
    todayDue: number;
    totalCards: number;
    lastMissedCount: number;
    isSentenceTrainer: boolean;
    createLabel: string;
    createHint: string;
    cardsLabel: string;
    importVisible: boolean;
    interactionsEnabled?: boolean;
    onStartLearning?: () => void;
    onOpenLearn?: () => void;
    onOpenCreate?: () => void;
    onOpenCards?: () => void;
    onOpenImport?: () => void;
    onRetryCounts?: () => void;
};
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

function ActionCard({ eyebrow, title, subtitle, icon, testId, onClick, disabled = false }: { eyebrow: string; title: string; subtitle: string; icon: IconName; testId: string; onClick?: () => void; disabled?: boolean }) {
    return <button type="button" data-testid={testId} onClick={onClick} disabled={disabled} className="group flex min-h-[250px] flex-col rounded-[28px] border border-soft bg-surface p-6 text-left shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-strong hover:shadow-warm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--accent-cta)] active:translate-y-0 disabled:cursor-default disabled:opacity-100 sm:p-7 md:min-h-[280px]">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-soft bg-surface-elevated text-accent-primary-strong transition group-hover:bg-accent-cta group-hover:text-on-accent"><DashboardIcon name={icon} /></span>
        <span className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</span><span className="mt-2 text-xl font-semibold tracking-tight text-primary">{title}</span><span className="mt-2 text-sm leading-6 text-muted">{subtitle}</span>
        <span className="mt-auto pt-5 text-sm font-semibold text-accent-primary-strong">Öffnen <span aria-hidden="true">→</span></span>
    </button>;
}

export default function TrainerDashboard(props: Props) {
    const { countsState, todayDue, totalCards, lastMissedCount, isSentenceTrainer, createLabel, createHint, cardsLabel, importVisible, interactionsEnabled = true, onStartLearning, onOpenLearn, onOpenCreate, onOpenCards, onOpenImport, onRetryCounts } = props;
    const countsPending = countsState === "pending";
    const countsError = countsState === "error";
    const itemLabel = isSentenceTrainer ? "Sätze" : "Karten";
    const countSummary = todayDue > 0 ? `${todayDue} heute fällig · ${totalCards} insgesamt` : lastMissedCount > 0 ? `${lastMissedCount} zuletzt nicht gewusste ${itemLabel} · ${totalCards} insgesamt` : totalCards > 0 ? `${totalCards} ${itemLabel} insgesamt` : `Noch keine ${itemLabel} angelegt`;
    const primaryLabel = countsPending ? "Training starten" : countsError ? "Erneut prüfen" : todayDue > 0 ? "Heute lernen starten" : "Weiterlernen starten";
    return <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5" aria-label="Trainer-Navigation">
        <section data-testid="trainer-dashboard-training-card" className="flex min-h-[250px] flex-col rounded-[28px] border border-soft bg-surface p-6 shadow-soft sm:p-7 md:min-h-[280px]" aria-labelledby="trainer-dashboard-training">
            <div className="flex items-center justify-between gap-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-soft bg-surface-elevated text-accent-primary-strong"><DashboardIcon name="learn" /></span><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-cta">Training</span></div>
            <h2 id="trainer-dashboard-training" className="mt-6 text-xl font-semibold tracking-tight text-primary">Training</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-muted">Wähle eine Lernrunde oder passe sie an.</p>
            <div className="mt-4 min-h-6 text-sm font-semibold text-accent-primary-strong" aria-live="polite">{countsPending ? <span data-testid="trainer-dashboard-counts-pending" className="inline-block h-4 w-40 rounded bg-surface-strong motion-safe:animate-pulse" aria-label="Lernzahlen werden ermittelt" /> : countsError ? "Lernzahlen konnten nicht geladen werden." : countSummary}</div>
            <div className="mt-auto grid gap-2 pt-5"><button type="button" className="btn btn-primary min-h-14 w-full" disabled={countsPending || !interactionsEnabled} onClick={countsError ? onRetryCounts : onStartLearning}>{primaryLabel}</button><button type="button" className="btn btn-ghost min-h-10 w-full text-sm" disabled={!interactionsEnabled} onClick={onOpenLearn}>Training anpassen</button>{!isSentenceTrainer ? <Link href="/credits#trainer-lion-audio" className="self-center text-xs text-muted underline-offset-4 hover:text-primary hover:underline">Audio-Credits</Link> : null}</div>
        </section>
        <ActionCard eyebrow="Erstellen" title={createLabel} subtitle={createHint} icon="create" testId="trainer-dashboard-create-card" onClick={onOpenCreate} disabled={!interactionsEnabled} />
        <ActionCard eyebrow="Verwalten" title={cardsLabel} subtitle="Durchsuchen, bearbeiten und aufräumen." icon="library" testId="trainer-dashboard-library-card" onClick={onOpenCards} disabled={!interactionsEnabled} />
        {importVisible ? <ActionCard eyebrow="Import" title="Bulk Import" subtitle="Vokabelliste einfügen, prüfen und importieren." icon="import" testId="trainer-dashboard-import-card" onClick={onOpenImport} disabled={!interactionsEnabled} /> : null}
    </section>;
}
