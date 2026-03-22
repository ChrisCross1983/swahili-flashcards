"use client";

import FullScreenSheet from "@/components/FullScreenSheet";
import type { AnalysisTarget, LearningAnalysis } from "@/lib/trainer/learningHelp";

type Props = {
    open: boolean;
    loading: boolean;
    analysis: LearningAnalysis | null;
    options: AnalysisTarget[];
    showSelection: boolean;
    onClose: () => void;
    onSelectTarget: (target: AnalysisTarget) => void;
};

function TypeBadge({ label }: { label: string }) {
    return <span className="inline-flex rounded-full border border-soft bg-surface px-2 py-1 text-xs font-semibold text-muted">{label}</span>;
}

function typeLabel(type: LearningAnalysis["type"]): string {
    if (type === "noun") return "Nomen";
    if (type === "verb") return "Verb";
    if (type === "phrase") return "Phrase";
    if (type === "greeting") return "Grußformel";
    if (type === "sentence") return "Satz";
    return "Unklar";
}

export default function LearningHelpPanel({
    open,
    loading,
    analysis,
    options,
    showSelection,
    onClose,
    onSelectTarget,
}: Props) {
    return (
        <FullScreenSheet open={open} title="Mehr Lernhilfe" onClose={onClose}>
            {showSelection ? (
                <div className="space-y-3">
                    <p className="text-sm text-muted">Was möchtest du genauer ansehen?</p>
                    {options.map((option) => (
                        <button
                            key={`${option.kind}-${option.value}`}
                            type="button"
                            className="w-full rounded-2xl border border-soft bg-surface p-3 text-left hover:bg-surface-elevated"
                            onClick={() => onSelectTarget(option)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            ) : null}

            {!showSelection && loading ? <div className="text-sm text-muted">Lernhilfe wird vorbereitet…</div> : null}

            {!showSelection && !loading && analysis ? (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <TypeBadge label={typeLabel(analysis.type)} />
                        <span className="text-sm text-muted">{analysis.target.value}</span>
                    </div>

                    {analysis.germanMeaning ? (
                        <div>
                            <div className="text-xs text-muted">Bedeutung</div>
                            <div className="font-medium text-primary">{analysis.germanMeaning}</div>
                        </div>
                    ) : null}

                    {analysis.type === "noun" ? (
                        <div className="space-y-1 rounded-2xl border border-soft bg-surface-elevated p-3 text-sm">
                            <div>Singular: {analysis.singular ?? "—"}</div>
                            <div>Plural: {analysis.plural ?? "—"}</div>
                            <div>Nomenklasse: {analysis.nounClass ?? "—"}</div>
                            {analysis.patternHint ? <div className="text-muted">{analysis.patternHint}</div> : null}
                        </div>
                    ) : null}

                    {analysis.type === "verb" ? (
                        <div className="space-y-1 rounded-2xl border border-soft bg-surface-elevated p-3 text-sm">
                            <div>Grundform: {analysis.baseForm ?? "—"}</div>
                            <div className="text-xs text-muted">Einfache Formen</div>
                            <div className="flex flex-wrap gap-2">
                                {(analysis.forms ?? []).map((form) => <span key={form} className="rounded-full border px-2 py-1">{form}</span>)}
                            </div>
                        </div>
                    ) : null}

                    {analysis.type === "phrase" || analysis.type === "greeting" ? (
                        <div className="space-y-1 rounded-2xl border border-soft bg-surface-elevated p-3 text-sm">
                            {analysis.contextNote ? <div>{analysis.contextNote}</div> : null}
                            {analysis.usageContext ? <div className="text-muted">Kontext: {analysis.usageContext}</div> : null}
                        </div>
                    ) : null}

                    {analysis.type === "sentence" ? (
                        <div className="space-y-1 rounded-2xl border border-soft bg-surface-elevated p-3 text-sm">
                            {analysis.structuralExplanation ? <div>{analysis.structuralExplanation}</div> : null}
                            {analysis.highlightParts?.length ? (
                                <div className="flex flex-wrap gap-2">
                                    {analysis.highlightParts.map((part) => <span key={part} className="rounded-full border px-2 py-1">{part}</span>)}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {analysis.example ? (
                        <div className="rounded-2xl border border-soft bg-surface-elevated p-3 text-sm">
                            <div className="text-xs text-muted">Beispiel</div>
                            <div>{analysis.example.sw}</div>
                            <div className="text-muted">{analysis.example.de}</div>
                        </div>
                    ) : null}

                    {analysis.fallback ? (
                        <div className="rounded-2xl border border-soft bg-surface p-3 text-xs text-muted">
                            Hinweis: Diese Lernhilfe nutzt aktuell nur vorhandene Kartendaten.
                        </div>
                    ) : null}
                </div>
            ) : null}
        </FullScreenSheet>
    );
}
