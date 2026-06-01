type Props = {
    correctCount: number;
    practiceAgainCount: number;
    attemptedCount?: number;
    remainingPoolCount?: number | null;
    endedEarly?: boolean;
};

function remainingPoolText(count: number) {
    if (count <= 0) return "Keine Karten mehr im Fehlerpool.";
    return `Noch ${count} ${count === 1 ? "Karte" : "Karten"} im Fehlerpool`;
}

export default function TrainerLastMissedSummary({
    correctCount,
    practiceAgainCount,
    attemptedCount,
    remainingPoolCount,
    endedEarly = false,
}: Props) {
    const total = typeof attemptedCount === "number"
        ? attemptedCount
        : correctCount + practiceAgainCount;
    const safeTotal = Math.max(0, total);
    const safeCorrect = Math.min(correctCount, safeTotal);
    const accuracy = safeTotal > 0 ? Math.round((safeCorrect / safeTotal) * 100) : 0;

    return (
        <div className="mt-4 w-full space-y-2 text-sm text-muted">
            <div className="font-medium text-primary">In dieser Runde:</div>
            <div className="flex items-center justify-between gap-4">
                <span>Gewusst</span>
                <span className="font-medium">{safeCorrect}/{safeTotal}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>Nochmal üben</span>
                <span className="font-medium">{practiceAgainCount}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>Trefferquote</span>
                <span className="font-medium">{accuracy}%</span>
            </div>
            {endedEarly ? (
                <div className="pt-1 text-xs text-muted">
                    Nur beantwortete Karten werden gezählt; offene Karten bleiben im Fehlerpool.
                </div>
            ) : null}
            {typeof remainingPoolCount === "number" ? (
                <div className="pt-2 text-xs text-muted">{remainingPoolText(remainingPoolCount)}</div>
            ) : null}
        </div>
    );
}
