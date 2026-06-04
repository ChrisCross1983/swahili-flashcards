import TrainerRepairAction from "@/components/trainer/TrainerRepairAction";

type Props = {
    wrongCount: number;
    onRepeat: () => void;
    onFinish: () => void;
    title?: string;
    description?: string;
    repairHelperText?: string;
};

export default function TrainerSummaryNextStep({
    wrongCount,
    onRepeat,
    onFinish,
    title = "Nächster sinnvoller Schritt",
    description,
    repairHelperText,
}: Props) {
    return (
        <div className="mt-5 w-full border-t border-soft pt-4 text-left">
            <div className="text-sm font-semibold text-primary">{title}</div>
            {description ? (
                <div className="mt-1 text-sm text-muted">{description}</div>
            ) : null}

            <TrainerRepairAction
                wrongCount={wrongCount}
                onRepeat={onRepeat}
                helperText={repairHelperText}
            />

            <button
                className="mt-3 w-full btn btn-primary py-3 text-base"
                type="button"
                onClick={onFinish}
            >
                Fertig
            </button>
        </div>
    );
}
