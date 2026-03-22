import CardText from "@/components/ui/CardText";

type Props = {
    reveal: boolean;
    prompt: string;
    answer: string;
    imagePath: string | null;
    imageBaseUrl: string;
    learningTypeLabel?: string | null;
    onOpenLearningHelp?: () => void;
};

export default function TrainerCard({
    reveal,
    prompt,
    answer,
    imagePath,
    imageBaseUrl,
    learningTypeLabel,
    onOpenLearningHelp,
}: Props) {
    return (
        <div className="rounded-3xl border border-soft bg-surface p-6 shadow-soft">
            <div className="text-sm text-muted">Übersetze:</div>
            <div className="mt-2 text-2xl font-semibold text-primary">
                <CardText>{prompt}</CardText>
            </div>

            {imagePath ? (
                <div className="mt-4">
                    <img src={`${imageBaseUrl}/${imagePath}`} alt="Kartenbild" className="h-40 w-full rounded-2xl object-cover" />
                </div>
            ) : null}

            {reveal ? (
                <div className="mt-8 rounded-2xl bg-surface-elevated p-4">
                    <div className="text-sm text-muted">Antwort</div>
                    <div className="mt-1 text-xl font-semibold text-primary">
                        <CardText>{answer}</CardText>
                    </div>

                    {onOpenLearningHelp ? (
                        <div className="mt-4 flex items-center justify-between gap-3">
                            {learningTypeLabel ? (
                                <span className="inline-flex rounded-full border border-soft bg-surface px-2 py-1 text-xs font-semibold text-muted">
                                    {learningTypeLabel}
                                </span>
                            ) : <span />}

                            <button
                                type="button"
                                className="rounded-full border border-soft bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-surface"
                                onClick={onOpenLearningHelp}
                            >
                                Mehr Lernhilfe
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
