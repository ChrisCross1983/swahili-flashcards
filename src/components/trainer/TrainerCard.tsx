"use client";

import { useState } from "react";
import CardText from "@/components/ui/CardText";
import FormattedExampleText from "@/components/ui/FormattedExampleText";

type Props = {
    reveal: boolean;
    prompt: string;
    answer: string;
    promptExample?: string | null;
    answerExample?: string | null;
    imagePath: string | null;
    imageBaseUrl: string;
    learningTypeLabel?: string | null;
    onOpenLearningHelp?: () => void;
};

type ExampleDisclosureProps = {
    id: string;
    open: boolean;
    onToggle: () => void;
    text: string;
};

function ExampleDisclosure({ id, open, onToggle, text }: ExampleDisclosureProps) {
    return (
        <div className="mt-2.5">
            <button
                type="button"
                className="group flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left text-xs font-medium text-muted transition hover:text-primary"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={id}
                data-testid={`${id}-toggle`}
            >
                <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="text-[11px] text-muted transition group-hover:text-primary">{open ? "▾" : "▸"}</span>
                    <span>Beispielsatz {open ? "ausblenden" : "anzeigen"}</span>
                </span>
            </button>
            {open ? (
                <div
                    id={id}
                    className="mt-1.5 rounded-lg border border-soft bg-surface px-3 py-2.5 text-sm text-muted"
                    data-testid={`${id}-content`}
                    data-tone="secondary"
                >
                    <FormattedExampleText text={text} />
                </div>
            ) : null}
        </div>
    );
}

export default function TrainerCard({
    reveal,
    prompt,
    answer,
    promptExample,
    answerExample,
    imagePath,
    imageBaseUrl,
    learningTypeLabel,
    onOpenLearningHelp,
}: Props) {
    const [showPromptExample, setShowPromptExample] = useState(false);
    const [showAnswerExample, setShowAnswerExample] = useState(false);

    return (
        <div className="rounded-3xl border border-soft bg-surface p-6 shadow-warm" data-testid="trainer-card-shell" data-mode="front">
            <div className={reveal ? "space-y-5" : "space-y-4"} data-testid="trainer-card-front" data-layout={reveal ? "expanded" : "compact"}>
                <div className="rounded-2xl border border-soft bg-surface-elevated p-4">
                    <div className="text-xs font-semibold tracking-wide text-muted uppercase">Übersetze</div>
                    <div className="mt-2 text-2xl font-semibold text-primary">
                        <CardText>{prompt}</CardText>
                    </div>
                    {promptExample?.trim() ? (
                        <ExampleDisclosure
                            id="prompt-example"
                            open={showPromptExample}
                            onToggle={() => setShowPromptExample((open) => !open)}
                            text={promptExample}
                        />
                    ) : null}
                </div>

                {reveal ? (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-cta bg-surface p-4 shadow-soft">
                            <div className="text-xs font-semibold tracking-wide text-accent-cta uppercase">Antwort</div>
                            <div className="mt-1 text-xl font-semibold text-primary">
                                <CardText>{answer}</CardText>
                            </div>
                            {answerExample?.trim() ? (
                                <ExampleDisclosure
                                    id="answer-example"
                                    open={showAnswerExample}
                                    onToggle={() => setShowAnswerExample((open) => !open)}
                                    text={answerExample}
                                />
                            ) : null}
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
        </div>
    );
}
