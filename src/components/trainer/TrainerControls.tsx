type Props = {
    reveal: boolean;
    hasAudio: boolean;
    onReveal: () => void;
    onPlayAudio: () => void;
    onWrong: () => void;
    onCorrect: () => void;
    gradingInFlight?: boolean;
    docked?: boolean;
    compact?: boolean;
};

export default function TrainerControls({
    reveal,
    hasAudio,
    onReveal,
    onPlayAudio,
    onWrong,
    onCorrect,
    gradingInFlight = false,
    docked = false,
    compact = false,
}: Props) {
    if (!reveal) {
        return (
            <button
                type="button"
                className={`btn btn-primary min-h-14 w-full touch-manipulation py-4 text-base shadow-warm active:scale-[0.98] active:opacity-90 disabled:cursor-wait disabled:opacity-70 ${docked ? "" : "mt-6"}`}
                onClick={onReveal}
                aria-busy={false}
                data-focus-role="primary-learning-action"
                data-tap-feedback="immediate"
            >
                Aufdecken
            </button>
        );
    }

    return (
        <>
            {hasAudio ? (
                <div className={docked ? "mb-2" : "mt-6"}>
                    <button
                        type="button"
                        className="btn btn-secondary touch-manipulation text-sm active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
                        onClick={onPlayAudio}
                        disabled={gradingInFlight}
                    >
                        🔊 Abspielen
                    </button>
                </div>
            ) : null}
            <div className={`${docked ? "" : compact ? "mt-3" : "mt-5"} grid grid-cols-2 gap-3`} data-grading-in-flight={gradingInFlight ? "true" : "false"}>
                <button
                    type="button"
                    className="btn btn-danger min-h-14 touch-manipulation py-4 text-base shadow-warm active:scale-[0.98] active:opacity-90 disabled:cursor-wait disabled:opacity-70"
                    onClick={onWrong}
                    disabled={gradingInFlight}
                    aria-busy={gradingInFlight}
                    data-focus-role="primary-learning-action"
                    data-tap-feedback="immediate"
                >
                    Nicht gewusst
                </button>

                <button
                    type="button"
                    className="btn btn-success min-h-14 touch-manipulation py-4 text-base shadow-warm active:scale-[0.98] active:opacity-90 disabled:cursor-wait disabled:opacity-70"
                    onClick={onCorrect}
                    disabled={gradingInFlight}
                    aria-busy={gradingInFlight}
                    data-focus-role="primary-learning-action"
                    data-tap-feedback="immediate"
                >
                    Gewusst
                </button>
            </div>
        </>
    );
}
