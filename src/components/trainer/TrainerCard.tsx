import CardText from "@/components/ui/CardText";
import type { ReactNode } from "react";

type Props = {
    reveal: boolean;
    prompt: string;
    answer: string;
    imagePath: string | null;
    imageBaseUrl: string;
    learningTypeLabel?: string | null;
    isFlipped?: boolean;
    onOpenLearningHelp?: () => void;
    onFlipBack?: () => void;
    backContent?: ReactNode;
};

export default function TrainerCard({
    reveal,
    prompt,
    answer,
    imagePath,
    imageBaseUrl,
    learningTypeLabel,
    isFlipped = false,
    onOpenLearningHelp,
    onFlipBack,
    backContent,
}: Props) {
    return (
        <div className="rounded-3xl border border-soft bg-surface p-6 shadow-warm" data-testid="trainer-card-shell" data-mode={isFlipped ? "notes" : "front"}>
            {isFlipped ? (
                <div className="space-y-4" data-testid="trainer-card-back">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold tracking-wide text-primary">Eigene Notizen</div>
                            <div className="text-xs text-muted">Dein persönlicher Lernbereich für diese Karte.</div>
                        </div>
                        {onFlipBack ? (
                            <button
                                type="button"
                                className="btn btn-utility rounded-full px-3 py-1.5 text-xs font-medium"
                                onClick={onFlipBack}
                            >
                                Zur Vorderseite
                            </button>
                        ) : null}
                    </div>
                    {backContent}
                </div>
            ) : (
                <div className={reveal ? "space-y-5" : "space-y-4"} data-testid="trainer-card-front" data-layout={reveal ? "expanded" : "compact"}>
                    <div>
                        <div className="text-xs font-semibold tracking-wide text-muted uppercase">Übersetze</div>
                        <div className="mt-2 text-2xl font-semibold text-primary">
                            <CardText>{prompt}</CardText>
                        </div>
                    </div>

                    {reveal ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-soft bg-surface-elevated p-4">
                                <div className="text-xs font-semibold tracking-wide text-muted uppercase">Antwort</div>
                                <div className="mt-1 text-xl font-semibold text-primary">
                                    <CardText>{answer}</CardText>
                                </div>
                            </div>

                            {imagePath ? (
                                <div>
                                    <img src={`${imageBaseUrl}/${imagePath}`} alt="Kartenbild" className="h-40 w-full rounded-2xl object-cover" />
                                </div>
                            ) : null}

                            {onOpenLearningHelp ? (
                                <div className="flex items-center justify-between gap-3">
                                    {learningTypeLabel ? <span className="badge">{learningTypeLabel}</span> : <span />}

                                    <button
                                        type="button"
                                        className="btn btn-secondary rounded-full px-3 py-1.5 text-sm font-medium"
                                        onClick={onOpenLearningHelp}
                                    >
                                        Eigene Notizen
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
