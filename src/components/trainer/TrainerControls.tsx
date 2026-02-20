type Props = {
    reveal: boolean;
    hasAudio: boolean;
    onReveal: () => void;
    onPlayAudio: () => void;
    onWrong: () => void;
    onCorrect: () => void;
};

export default function TrainerControls({
    reveal,
    hasAudio,
    onReveal,
    onPlayAudio,
    onWrong,
    onCorrect,
}: Props) {
    if (!reveal) {
        return (
            <button type="button" className="btn btn-primary w-full py-4 text-base" onClick={onReveal}>
                Aufdecken
            </button>
        );
    }

    return (
        <>
            {hasAudio ? (
                <div className="mt-6">
                    <button type="button" className="btn btn-ghost text-sm" onClick={onPlayAudio}>
                        🔊 Abspielen
                    </button>
                </div>
            ) : null}
            <div className="mt-10 grid grid-cols-2 gap-6">
                <button type="button" className="btn btn-danger py-4 text-base active:scale-[0.99]" onClick={onWrong}>
                    Nicht gewusst
                </button>

                <button type="button" className="btn btn-success py-4 text-base active:scale-[0.99]" onClick={onCorrect}>
                    Gewusst
                </button>
            </div>
        </>
    );
}
