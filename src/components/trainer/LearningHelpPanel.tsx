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
    if (type === "plural_noun") return "Plural-Nomen";
    if (type === "verb") return "Verb";
    if (type === "phrase") return "Phrase";
    if (type === "greeting") return "Grußformel";
    if (type === "sentence") return "Satz";
    if (type === "number") return "Zahlwort";
    if (type === "particle") return "Partikel / Antwortwort";
    if (type === "adverb") return "Adverb / Ortswort";
    if (type === "adjective") return "Adjektiv";
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

                    {analysis.type === "noun" || analysis.type === "plural_noun" ? (
                        <div className="space-y-1 rounded-2xl border border-soft bg-surface-elevated p-3 text-sm">
                            <div>Singular: {analysis.singular ?? "—"}</div>
                            <div>Plural: {analysis.plural ?? "—"}</div>
                            <div>Nomenklasse: {analysis.nounClass ?? "—"}</div>
                            {analysis.patternHint ? <div className="text-muted">{analysis.patternHint}</div> : null}
                            {analysis.patternExplanation ? <div className="text-muted">{analysis.patternExplanation}</div> : null}
                            {analysis.concordanceHints?.length ? (
                                <div className="pt-1">
                                    <div className="text-xs text-muted">Kongruenz-Hinweis</div>
                                    {analysis.concordanceHints.map((hint) => <div key={hint}>{hint}</div>)}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {analysis.type === "verb" ? (
                        <div className="space-y-1 rounded-2xl border border-soft bg-surface-elevated p-3 text-sm">
                            <div>Grundform: {analysis.baseForm ?? "—"}</div>
                            <div className="text-xs text-muted">Einfache Formen</div>
                            <div className="flex flex-wrap gap-2">
                                {(analysis.forms ?? []).map((form) => <span key={form} className="rounded-full border px-2 py-1">{form}</span>)}
                            </div>
                            {analysis.prefixNotes?.length ? (
                                <div className="pt-1">
                                    <div className="text-xs text-muted">Subjektpräfixe</div>
                                    {analysis.prefixNotes.map((note) => <div key={note}>{note}</div>)}
                                </div>
                            ) : null}
                            {analysis.patternExplanation ? <div className="text-muted">{analysis.patternExplanation}</div> : null}
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

                    {analysis.type === "number" || analysis.type === "particle" || analysis.type === "adverb" || analysis.type === "adjective" ? (
                        <div className="space-y-1 rounded-2xl border border-soft bg-surface-elevated p-3 text-sm">
                            {analysis.roleHint ? <div>{analysis.roleHint}</div> : null}
                            {analysis.usageContext ? <div className="text-muted">Kontext: {analysis.usageContext}</div> : null}
                            {analysis.commonPairings?.length ? (
                                <div>
                                    <div className="text-xs text-muted">Typische Verbindungen</div>
                                    {analysis.commonPairings.map((entry) => <div key={entry}>{entry}</div>)}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {analysis.example ? (
                        <div className="rounded-2xl border border-soft bg-surface-elevated p-3 text-sm">
                            <div className="text-xs text-muted">Beispiel</div>
                            <div>{analysis.example.sw}</div>
                            {analysis.example.literalDe ? <div className="text-muted">Wörtlich: {analysis.example.literalDe}</div> : null}
                            <div className="text-muted">Natürlich: {analysis.example.naturalDe}</div>
                        </div>
                    ) : null}

                    {analysis.translation?.literal || analysis.translation?.natural ? (
                        <div className="rounded-2xl border border-soft bg-surface-elevated p-3 text-sm">
                            <div className="text-xs text-muted">Übersetzungsebene</div>
                            {analysis.translation.literal ? <div>Wörtlich: {analysis.translation.literal}</div> : null}
                            {analysis.translation.natural ? <div className="text-muted">Natürliches Deutsch: {analysis.translation.natural}</div> : null}
                        </div>
                    ) : null}

                    {analysis.usageNotes?.length ? (
                        <div className="rounded-2xl border border-soft bg-surface-elevated p-3 text-sm">
                            {analysis.usageNotes.map((note) => <div key={note}>{note}</div>)}
                        </div>
                    ) : null}

                    {analysis.fallback ? (
                        <div className="rounded-2xl border border-soft bg-surface p-3 text-xs text-muted">
                            Hinweis: Für diese Karte sind nur Basisdaten vorhanden – wähle ggf. ein einzelnes Wort oder prüfe weitere Karten mit ähnlichem Muster.
                        </div>
                    ) : null}
                </div>
            ) : null}
        </FullScreenSheet>
    );
}
