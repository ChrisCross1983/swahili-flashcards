type Props = {
    correctCount: number;
    practiceAgainCount: number;
    attemptedCount?: number;
    remainingPoolCount?: number | null;
    endedEarly?: boolean;
};

function remainingPoolText(count: number) {
    if (count <= 0) return "Im Fehlerpool verbleiben keine Karten mehr.";
    return `Im Fehlerpool verbleiben noch ${count} ${count === 1 ? "Karte" : "Karten"}.`;
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
                <span>Nicht gewusst</span>
                <span className="font-medium">{practiceAgainCount}/{safeTotal}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>Trefferquote</span>
                <span className="font-medium">{accuracy}%</span>
            </div>
            {endedEarly ? (
                <div className="pt-1 text-xs text-muted">
                    Gezählt werden nur Karten, die du in dieser Runde beantwortet hast.
                </div>
            ) : null}
            {typeof remainingPoolCount === "number" ? (
                <div className="pt-2 text-xs text-muted">{remainingPoolText(remainingPoolCount)}</div>
            ) : null}
        </div>
    );
}
