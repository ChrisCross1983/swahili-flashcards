type Props = {
    correctCount: number;
    practiceAgainCount: number;
    remainingPoolCount?: number | null;
};

function remainingPoolText(count: number) {
    if (count <= 0) return "Keine Karten mehr im Fehlerpool.";
    return `Noch ${count} ${count === 1 ? "Karte" : "Karten"} im Fehlerpool`;
}

export default function TrainerLastMissedSummary({
    correctCount,
    practiceAgainCount,
    remainingPoolCount,
}: Props) {
    return (
        <div className="mt-4 w-full space-y-2 text-sm text-muted">
            <div className="font-medium text-primary">In dieser Runde:</div>
            <div className="flex items-center justify-between gap-4">
                <span>Gewusst</span>
                <span className="font-medium">{correctCount}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>Nochmal üben</span>
                <span className="font-medium">{practiceAgainCount}</span>
            </div>
            {typeof remainingPoolCount === "number" ? (
                <div className="pt-2 text-xs text-muted">{remainingPoolText(remainingPoolCount)}</div>
            ) : null}
        </div>
    );
}
