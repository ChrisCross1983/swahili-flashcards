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
    backContent,
}: Props) {
    return (
        <div className="[perspective:1200px]">
            <div className={`relative min-h-[320px] transition-transform duration-300 [transform-style:preserve-3d] ${isFlipped ? "[transform:rotateY(180deg)]" : ""}`}>
                <div className="absolute inset-0 rounded-3xl border border-soft bg-surface p-6 shadow-soft [backface-visibility:hidden]">
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
                                    {learningTypeLabel ? <span className="inline-flex rounded-full border border-soft bg-surface px-2 py-1 text-xs font-semibold text-muted">{learningTypeLabel}</span> : <span />}

                                    <button
                                        type="button"
                                        className="rounded-full border border-soft bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-surface"
                                        onClick={onOpenLearningHelp}
                                    >
                                        Karte umdrehen
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
                <div className="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]">
                    {backContent}
                </div>
            </div>
        </div>
    );
}
