"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import CardText from "@/components/ui/CardText";
import FormattedExampleText from "@/components/ui/FormattedExampleText";
import CompactOverlay from "@/components/CompactOverlay";
import SentenceExplanationDisclosure from "@/components/trainer/SentenceExplanationDisclosure";
import type { SentenceExplanation } from "@/lib/sentence/explanation";

type Props = {
    reveal: boolean;
    prompt: string;
    answer: string;
    promptExample?: string | null;
    answerExample?: string | null;
    showExamples?: boolean;
    imagePath: string | null;
    imageBaseUrl: string;
    learningTypeLabel?: string | null;
    onOpenLearningHelp?: () => void;
    sentenceExplanation?: SentenceExplanation | null;
    learningFeature?: ReactNode;
    footer?: ReactNode;
    compactVocabExtras?: boolean;
    autoOpenExplanation?: boolean;
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
    showExamples = true,
    imagePath,
    imageBaseUrl,
    learningTypeLabel,
    onOpenLearningHelp,
    sentenceExplanation,
    learningFeature,
    footer,
    compactVocabExtras = false,
    autoOpenExplanation = false,
}: Props) {
    const [showPromptExample, setShowPromptExample] = useState(false);
    const [showAnswerExample, setShowAnswerExample] = useState(false);
    const [showSentenceExplanation, setShowSentenceExplanation] = useState(autoOpenExplanation);
    const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
    const imageUrl = imagePath ? `${imageBaseUrl}/${imagePath}` : null;

    return (
        <>
        <div className={compactVocabExtras ? "min-w-0" : "rounded-3xl border border-soft bg-surface p-5 shadow-warm sm:p-6"} data-testid="trainer-card-shell" data-mode="front" data-focus-role="recall-card">
            <div className={reveal ? compactVocabExtras ? "space-y-2.5 sm:space-y-4" : "space-y-5" : "space-y-4"} data-testid="trainer-card-front" data-layout={reveal ? "expanded" : "compact"}>
                <div className={`min-w-0 rounded-2xl border border-soft bg-surface-elevated ${compactVocabExtras ? "p-3 sm:p-4" : "p-5"}`}>
                    <div className="text-xs font-semibold tracking-wide text-muted uppercase">Übersetze</div>
                    <div className="mt-2 min-w-0 text-3xl font-semibold leading-tight text-primary sm:text-4xl">
                        <CardText>{prompt}</CardText>
                    </div>
                    {showExamples && promptExample?.trim() ? (
                        <ExampleDisclosure
                            id="prompt-example"
                            open={showPromptExample}
                            onToggle={() => setShowPromptExample((open) => !open)}
                            text={promptExample}
                        />
                    ) : null}
                </div>

                {reveal ? (
                    <div className={compactVocabExtras ? "space-y-2.5 sm:space-y-4" : "space-y-4"}>
                        <div className={`min-w-0 rounded-2xl border border-cta bg-surface shadow-soft ${compactVocabExtras ? "p-3 sm:p-4" : "p-4"}`}>
                            <div className="text-xs font-semibold tracking-wide text-accent-cta uppercase">Antwort</div>
                            <div className="mt-2 text-2xl font-semibold leading-tight text-primary sm:text-3xl">
                                <CardText>{answer}</CardText>
                            </div>
                            {showExamples && answerExample?.trim() ? (
                                <ExampleDisclosure
                                    id="answer-example"
                                    open={showAnswerExample}
                                    onToggle={() => setShowAnswerExample((open) => !open)}
                                    text={answerExample}
                                />
                            ) : null}
                        </div>

                        {!compactVocabExtras && imageUrl ? (
                            <div>
                                <img src={imageUrl} alt="Kartenbild" className="trainer-learning-image" />
                            </div>
                        ) : null}

                        {sentenceExplanation ? <SentenceExplanationDisclosure
                            explanation={sentenceExplanation}
                            open={showSentenceExplanation}
                            onToggle={() => setShowSentenceExplanation((open) => !open)}
                        /> : null}

                        {learningFeature}

                        {compactVocabExtras && imageUrl ? (
                            <div className="overflow-hidden rounded-xl border border-soft bg-surface-elevated" data-testid="trainer-inline-image">
                                <button
                                    type="button"
                                    className="block w-full cursor-zoom-in touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)]"
                                    onClick={() => setImagePreviewOpen(true)}
                                    aria-label="Kartenbild vergrößern"
                                >
                                    <Image src={imageUrl} alt="Kartenbild" width={640} height={320} unoptimized className="block h-[clamp(9.375rem,20dvh,11.25rem)] w-full object-contain sm:h-56" />
                                </button>
                            </div>
                        ) : null}

                        {onOpenLearningHelp && !compactVocabExtras ? (
                            <div className="flex items-center justify-between gap-3" data-testid="learning-secondary-actions">
                                {learningTypeLabel ? <span className="badge">{learningTypeLabel}</span> : <span />}

                                <button
                                    type="button"
                                    className="btn btn-ghost rounded-full px-3 py-1.5 text-sm font-medium"
                                    onClick={onOpenLearningHelp}
                                >
                                    Eigene Notizen
                                </button>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {footer}
            </div>
        </div>
        {imagePreviewOpen && imageUrl && typeof document !== "undefined" ? createPortal(
            <CompactOverlay open title="Kartenbild" onClose={() => setImagePreviewOpen(false)} maxWidthClassName="max-w-3xl">
                <Image src={imageUrl} alt="Kartenbild vergrößert" width={1280} height={960} unoptimized className="mx-auto block max-h-[calc(100dvh-9rem)] w-auto max-w-full object-contain" />
            </CompactOverlay>,
            document.body,
        ) : null}
        </>
    );
}
