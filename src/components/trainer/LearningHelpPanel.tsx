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
        <div className="rounded-3xl border border-soft bg-surface p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-primary">Lernhilfe · Kartenrückseite</div>
                <button type="button" className="rounded-full border border-soft px-3 py-1.5 text-xs text-muted hover:bg-surface-elevated" onClick={onFlipBack}>
                    Zur Vorderseite
                </button>
            </div>

            {showSelection ? (
                <div className="mt-4 space-y-2">
                    <p className="text-sm text-muted">Was möchtest du genauer ansehen?</p>
                    {options.map((option) => (
                        <button
                            key={`${option.kind}-${option.value}`}
                            type="button"
                            className="w-full rounded-xl border border-soft bg-surface-elevated p-3 text-left text-sm hover:bg-surface"
                            onClick={() => onSelectTarget(option)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            ) : null}

            {!showSelection && loading ? <div className="mt-4 text-sm text-muted">Lernhilfe wird vorbereitet…</div> : null}

            {!showSelection && !loading && analysis ? (
                <div className="mt-4 space-y-3">
                    <div className="inline-flex rounded-full border border-soft bg-surface-elevated px-2.5 py-1 text-xs font-semibold text-muted">
                        {typeLabel(analysis.type)} · {analysis.target.value}
                    </div>
                    {analysis.sections.map((section) => (
                        <div key={section.title} className="rounded-2xl border border-soft bg-surface-elevated p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{section.title}</div>
                            <div className="mt-1 space-y-1 text-sm text-primary">
                                {section.lines.map((line) => (
                                    <div key={line}>{line}</div>
                                ))}
                            </div>

                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
