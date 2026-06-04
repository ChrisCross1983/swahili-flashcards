type Props = {
    wrongCount: number;
    onRepeat: () => void;
    helperText?: string;
};

export default function TrainerRepairAction({
    wrongCount,
    onRepeat,
    helperText = "Übt nur die Karten, die in dieser Runde nicht geklappt haben.",
}: Props) {
    if (wrongCount <= 0) return null;

    return (
        <div className="mt-5 w-full rounded-2xl border border-soft bg-surface-elevated p-4 text-left">
            <button
                className="btn btn-ghost w-full justify-center py-3"
                type="button"
                onClick={onRepeat}
            >
                Fehler kurz wiederholen
            </button>
            <div className="mt-2 text-center text-xs text-muted">{helperText}</div>
        </div>
    );
}
