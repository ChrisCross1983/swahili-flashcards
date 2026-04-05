"use client";

type CardNoteDraft = {
    mainNotes: string;
    memoryHint: string;
    exampleSentence: string;
    confusionNote: string;
};

type Props = {
    loading: boolean;
    draft: CardNoteDraft;
    saveStateText: string | null;
    saving: boolean;
    onChange: (field: keyof CardNoteDraft, value: string) => void;
    onSave: () => void;
};

export default function LearningHelpPanel({
    loading,
    draft,
    saveStateText,
    saving,
    onChange,
    onSave,
}: Props) {
    if (loading) {
        return <div className="text-sm text-muted">Notizen werden geladen…</div>;
    }
    return (
        <div className="space-y-4" data-testid="learning-notes-panel">
            <p className="text-sm text-muted">Dein persönlicher Lernbereich für diese Karte.</p>

            <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Eigene Notizen</label>
                <textarea
                    className="min-h-28 w-full rounded-xl border border-soft bg-surface-elevated p-3 text-sm text-primary"
                    placeholder="Merkhilfe, Grammatik, Mini-Übersetzung oder was dir beim Merken hilft…"
                    value={draft.mainNotes}
                    onChange={(event) => onChange("mainNotes", event.target.value)}
                />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Merkhilfe</label>
                    <input
                        className="w-full rounded-xl border border-soft bg-surface-elevated p-3 text-sm"
                        placeholder="Kurzer Gedächtnisanker"
                        value={draft.memoryHint}
                        onChange={(event) => onChange("memoryHint", event.target.value)}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Beispielsatz</label>
                    <input
                        className="w-full rounded-xl border border-soft bg-surface-elevated p-3 text-sm"
                        placeholder="z.B. Ninapenda kitabu hiki."
                        value={draft.exampleSentence}
                        onChange={(event) => onChange("exampleSentence", event.target.value)}
                    />
                </div>
            </div>

            <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Verwechslungswort</label>
                <input
                    className="w-full rounded-xl border border-soft bg-surface-elevated p-3 text-sm"
                    placeholder="Womit verwechselst du diese Karte oft?"
                    value={draft.confusionNote}
                    onChange={(event) => onChange("confusionNote", event.target.value)}
                />
            </div>

            <div className="flex items-center justify-between gap-3">
                <button type="button" className="rounded-xl border border-soft px-4 py-2 text-sm font-medium" onClick={onSave} disabled={saving}>
                    {saving ? "Speichert…" : "Notizen speichern"}
                </button>
                {saveStateText ? <span className="text-xs text-muted">{saveStateText}</span> : null}
            </div>
        </div>
    );
}
