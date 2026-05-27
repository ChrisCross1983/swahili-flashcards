type Props = {
    reveal: boolean;
    hasAudio: boolean;
    onReveal: () => void;
    onPlayAudio: () => void;
    onWrong: () => void;
    onCorrect: () => void;
    gradingInFlight?: boolean;
};

export default function TrainerControls({
    reveal,
    hasAudio,
    onReveal,
    onPlayAudio,
    onWrong,
    onCorrect,
    gradingInFlight = false,
}: Props) {
    if (!reveal) {
        return (
            <button
                type="button"
                className="btn btn-primary mt-6 w-full py-4 text-base disabled:cursor-wait disabled:opacity-70"
                onClick={onReveal}
                disabled={gradingInFlight}
                aria-busy={gradingInFlight}
            >
                Aufdecken
            </button>
        );
    }

    return (
        <>
            {hasAudio ? (
                <div className="mt-6">
                    <button
                        type="button"
                        className="btn btn-secondary text-sm disabled:cursor-wait disabled:opacity-70"
                        onClick={onPlayAudio}
                        disabled={gradingInFlight}
                    >
                        🔊 Abspielen
                    </button>
                </div>
            ) : null}
            <div className="mt-10 grid grid-cols-2 gap-6" data-grading-in-flight={gradingInFlight ? "true" : "false"}>
                <button
                    type="button"
                    className="btn btn-danger py-4 text-base active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
                    onClick={onWrong}
                    disabled={gradingInFlight}
                    aria-busy={gradingInFlight}
                >
                    Nicht gewusst
                </button>

                <button
                    type="button"
                    className="btn btn-success py-4 text-base active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
                    onClick={onCorrect}
                    disabled={gradingInFlight}
                    aria-busy={gradingInFlight}
                >
                    Gewusst
                </button>
            </div>
        </>
    );
}
