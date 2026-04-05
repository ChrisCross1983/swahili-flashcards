"use client";

import type { AnalysisTarget, LearningAnalysis } from "@/lib/trainer/learningHelp";

type Props = {
    loading: boolean;
    analysis: LearningAnalysis | null;
    options: AnalysisTarget[];
    showSelection: boolean;
    onSelectTarget: (target: AnalysisTarget) => void;
    onFlipBack: () => void;
};

function typeLabel(type: LearningAnalysis["type"]): string {
    if (type === "noun") return "Nomen";
    if (type === "plural_noun") return "Plural-Nomen";
    if (type === "verb") return "Verb";
    if (type === "pronoun") return "Pronomen";
    if (type === "phrase") return "Phrase";
    if (type === "greeting") return "Grußformel";
    if (type === "sentence") return "Satz";
    if (type === "number") return "Zahlwort";
    if (type === "particle") return "Partikel";
    if (type === "adverb") return "Adverb";
    if (type === "adjective") return "Adjektiv";
    return "Lernhilfe";
}

export default function LearningHelpPanel({
    loading,
    analysis,
    options,
    showSelection,
    onSelectTarget,
    onFlipBack,
}: Props) {
    return (
        <div className="space-y-4" data-testid="learning-help-panel">
            {showSelection ? (
                <div className="space-y-2">
                    <p className="text-sm text-muted">Welche Ebene hilft dir gerade am meisten?</p>
                    {options.map((option) => (
                        <button
                            key={`${option.kind}-${option.value}`}
                            type="button"
                            className="w-full rounded-xl border border-soft bg-surface-elevated p-3 text-left text-sm text-primary hover:bg-surface"
                            onClick={() => onSelectTarget(option)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            ) : null}

            {!showSelection && loading ? <div className="text-sm text-muted">Lerntipps werden vorbereitet…</div> : null}

            {!showSelection && !loading && analysis ? (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="inline-flex rounded-full border border-soft bg-surface-elevated px-2.5 py-1 text-xs font-semibold text-muted">
                            {typeLabel(analysis.type)} · {analysis.target.value}
                        </div>
                        <button type="button" className="rounded-full border border-soft px-3 py-1 text-xs text-muted hover:bg-surface-elevated" onClick={onFlipBack}>
                            Zur Aufgabe
                        </button>
                    </div>

                    {analysis.sections.map((section) => (
                        <section key={section.title} className="rounded-2xl border border-soft bg-surface-elevated p-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{section.title}</h3>
                            <ul className="mt-1 space-y-1 text-sm text-primary">
                                {section.lines.map((line) => (
                                    <li key={line}>{line}</li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
