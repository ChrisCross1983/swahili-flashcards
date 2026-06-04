import TrainerLastMissedSummary from "@/components/trainer/TrainerLastMissedSummary";
import TrainerSummaryNextStep from "@/components/trainer/TrainerSummaryNextStep";

export type TrainerSummaryMode =
    | "today_complete"
    | "today_partial"
    | "last_missed"
    | "repair_complete"
    | "drill_complete";

export type TrainerTodayOverview = {
    sessionTotal: number;
    sessionCorrect: number;
    cardsCountLabel: string;
    totalCards: number;
    todayCount: number;
    tomorrowCount: number;
    laterCount: number;
    nextText: string;
};

export type TrainerSessionSummaryViewModel = {
    mode: TrainerSummaryMode;
    knownCount: number;
    wrongCount: number;
    answeredCount: number;
    accuracy: number | null;
    remainingPoolCount?: number | null;
    canRepair: boolean;
    isEarlyEnd?: boolean;
    todayOverview?: TrainerTodayOverview;
};

type BuildSummaryInput = {
    learnMode: "LEITNER_TODAY" | "DRILL" | null;
    isLastMissedSession: boolean;
    repairDrillActive: boolean;
    endedEarly: boolean;
    lastMissedEmpty: boolean;
    knownCount: number;
    wrongCount: number;
    answeredCount: number;
    remainingPoolCount?: number | null;
    canRepair: boolean;
    todayOverview?: TrainerTodayOverview;
};

export function buildTrainerSessionSummaryViewModel({
    learnMode,
    isLastMissedSession,
    repairDrillActive,
    endedEarly,
    lastMissedEmpty,
    knownCount,
    wrongCount,
    answeredCount,
    remainingPoolCount,
    canRepair,
    todayOverview,
}: BuildSummaryInput): TrainerSessionSummaryViewModel {
    const safeAnswered = Math.max(0, answeredCount);
    const safeKnown = Math.max(0, Math.min(knownCount, safeAnswered));
    const safeWrong = Math.max(0, wrongCount);
    const accuracy = safeAnswered > 0 ? Math.round((safeKnown / safeAnswered) * 100) : 0;

    let mode: TrainerSummaryMode = "drill_complete";
    if (endedEarly) {
        mode = isLastMissedSession ? "last_missed" : "today_partial";
    } else if (learnMode === "LEITNER_TODAY") {
        mode = "today_complete";
    } else if (isLastMissedSession || lastMissedEmpty) {
        mode = repairDrillActive ? "repair_complete" : "last_missed";
    }

    return {
        mode,
        knownCount: safeKnown,
        wrongCount: safeWrong,
        answeredCount: safeAnswered,
        accuracy,
        remainingPoolCount,
        canRepair: canRepair && safeWrong > 0,
        isEarlyEnd: endedEarly,
        todayOverview,
    };
}

type Props = {
    summary: TrainerSessionSummaryViewModel;
    onRepair: () => void;
    onFinish: () => void;
};

function summaryTitle(summary: TrainerSessionSummaryViewModel) {
    if (summary.isEarlyEnd) {
        return summary.mode === "last_missed" ? "Wiederholung beendet" : "Session beendet";
    }
    if (summary.mode === "today_complete") {
        return summary.answeredCount > 0 ? "Training abgeschlossen" : "Für heute bist du durch";
    }
    if (summary.mode === "last_missed") {
        return summary.answeredCount === 0 ? "Keine zuletzt nicht gewussten Karten" : "Wiederholung beendet";
    }
    if (summary.mode === "repair_complete") return "Fehler kurz wiederholt";
    return "Session abgeschlossen";
}

function completionCopy(summary: TrainerSessionSummaryViewModel) {
    if (summary.isEarlyEnd) {
        return summary.mode === "last_missed"
            ? "Du hast vorzeitig beendet. Gezählt werden nur Karten, die du in dieser Runde beantwortet hast."
            : "Du hast vorzeitig beendet. Hier ist dein aktuelles Ergebnis.";
    }
    if (summary.mode === "today_complete") {
        return summary.answeredCount > 0
            ? "Für heute bist du durch. Morgen geht es entspannt weiter."
            : "Für heute ist nichts offen. Dein Rhythmus passt.";
    }
    if (summary.mode === "last_missed" && summary.answeredCount === 0) {
        return "Der Fehlerpool ist leer. Für jetzt gibt es hier nichts zu wiederholen.";
    }
    return null;
}

function nextStepDescription(summary: TrainerSessionSummaryViewModel) {
    if (summary.isEarlyEnd) {
        return summary.canRepair
            ? "Du hast schon etwas geschafft. Wiederhole nur die Karten, die gerade nicht geklappt haben, oder schließ für jetzt ab."
            : "Du hast eine kurze Runde geschafft. Für jetzt kannst du ruhig abschließen.";
    }
    if (summary.mode === "today_complete") {
        return summary.canRepair
            ? "Wiederhole deine Fehler kurz oder schließ die heutige Runde ab."
            : "Starke Runde. Du hast heute viele Karten sicher gewusst.";
    }
    if (summary.mode === "last_missed") {
        if (summary.answeredCount === 0) return "Du kannst später weitermachen oder eine andere kleine Runde starten.";
        return summary.canRepair
            ? "Bleib bei den Karten aus dieser Runde oder schließ die Wiederholung ab."
            : "Du hast den Fehlerpool für diese Runde ruhig abgearbeitet.";
    }
    if (summary.mode === "repair_complete") {
        return summary.canRepair
            ? "Bleib bei den Karten aus dieser Runde oder schließ die Wiederholung ab."
            : "Die kurze Fehlerwiederholung ist abgeschlossen.";
    }
    return summary.canRepair
        ? "Wiederhole die Fehler kurz oder schließ diese Runde ab."
        : "Starke Runde. Du kannst später weitermachen oder jetzt abschließen.";
}

function repairHelperText(summary: TrainerSessionSummaryViewModel) {
    if (summary.mode === "last_missed" || summary.mode === "repair_complete") {
        return "Wiederholt nur die nicht gewussten Karten aus dieser Runde.";
    }
    return undefined;
}

function SummaryStats({ summary }: { summary: TrainerSessionSummaryViewModel }) {
    if (summary.mode === "last_missed" || summary.mode === "repair_complete") {
        if (summary.mode === "last_missed" && summary.answeredCount === 0) return null;

        return (
            <TrainerLastMissedSummary
                correctCount={summary.knownCount}
                practiceAgainCount={summary.wrongCount}
                attemptedCount={summary.answeredCount}
                remainingPoolCount={summary.remainingPoolCount}
                endedEarly={summary.isEarlyEnd}
            />
        );
    }

    return (
        <div className="mt-4 w-full space-y-2 text-sm text-muted">
            <div className="flex items-center justify-between gap-4">
                <span>Gewusst</span>
                <span className="font-medium">{summary.knownCount}/{summary.answeredCount}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>Nicht gewusst</span>
                <span className="font-medium">{summary.wrongCount}/{summary.answeredCount}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>Trefferquote</span>
                <span className="font-medium">{summary.accuracy ?? 0}%</span>
            </div>
        </div>
    );
}

function TodayOverview({ overview }: { overview: TrainerTodayOverview }) {
    return (
        <div className="mt-4 rounded-2xl border p-6 shadow-soft bg-surface">
            <div className="text-sm font-semibold text-primary">📊 Heute</div>

            {overview.sessionTotal > 0 ? (
                <div className="mt-3 rounded-2xl border p-4 bg-surface-elevated">
                    <div className="text-base font-semibold flex items-center justify-between gap-3">
                        <span>
                            {overview.sessionCorrect} von {overview.sessionTotal} Karten sicher{" "}
                            <span className="text-muted font-medium">
                                ({overview.sessionTotal > 0 ? Math.round((overview.sessionCorrect / overview.sessionTotal) * 100) : 0}% gewusst)
                            </span>
                        </span>
                    </div>
                    <div className="mt-2 text-sm text-muted">
                        {overview.sessionTotal - overview.sessionCorrect} Karten üben wir nochmal
                    </div>

                    <div className="mt-3 h-2 w-full rounded-full border border-soft">
                        <div
                            className="h-2 rounded-full"
                            style={{
                                width: `${Math.round((overview.sessionCorrect / overview.sessionTotal) * 100)}%`,
                                backgroundColor: "var(--accent-success)",
                            }}
                        />
                    </div>
                </div>
            ) : (
                <div className="mt-2 text-sm text-muted">Keine Session-Daten.</div>
            )}

            <div className="mt-6 text-sm font-semibold text-primary">🌱 Dein Lernstand</div>

            <div className="mt-3 rounded-2xl border p-4 text-sm bg-surface-elevated">
                <div className="flex items-center justify-between">
                    <span className="text-muted">{overview.cardsCountLabel}</span>
                    <span className="font-semibold">{overview.totalCards}</span>
                </div>

                <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-muted">📅 Heute fällig</span>
                        <span className="font-medium">{overview.todayCount}</span>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-muted">🔁 Morgen dran</span>
                        <span className="font-medium">{overview.tomorrowCount}</span>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-muted">✅ Später wiederholen</span>
                        <span className="font-medium">{overview.laterCount}</span>
                    </div>
                </div>
            </div>

            <div className="mt-6 text-sm font-semibold text-primary">⏰ Nächstes Training</div>
            <div className="mt-2 rounded-2xl border p-4 text-sm text-muted bg-surface-elevated">
                Nächste Karten sind {overview.nextText} dran.
            </div>

            <div className="mt-4 rounded-2xl border p-4 text-sm text-muted bg-surface-elevated">
                Tipp: Kurze, regelmäßige Sessions bringen mehr als lange Lernphasen.
            </div>
        </div>
    );
}

export default function TrainerSessionSummary({ summary, onRepair, onFinish }: Props) {
    const copy = completionCopy(summary);

    return (
        <div className="mt-4 rounded-2xl border p-6 bg-surface shadow-soft">
            <div className={summary.mode === "today_partial" ? "text-lg font-semibold" : "text-sm font-semibold text-primary"}>
                {summaryTitle(summary)}
            </div>
            {copy ? (
                <div className="mt-2 text-sm text-muted">{copy}</div>
            ) : null}

            <SummaryStats summary={summary} />

            <TrainerSummaryNextStep
                wrongCount={summary.canRepair ? summary.wrongCount : 0}
                onRepeat={onRepair}
                onFinish={onFinish}
                description={nextStepDescription(summary)}
                repairHelperText={repairHelperText(summary)}
            />

            {summary.mode === "today_complete" && summary.todayOverview ? (
                <TodayOverview overview={summary.todayOverview} />
            ) : null}
        </div>
    );
}
