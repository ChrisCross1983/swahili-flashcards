"use client";

type CardNoteDraft = {
    mainNotes: string;
};

type Props = {
    loading: boolean;
    draft: CardNoteDraft;
    saveStateText: string | null;
    onChange: (value: string) => void;
};

export default function LearningHelpPanel({
    loading,
    draft,
    saveStateText,
    onChange,
}: Props) {
    if (loading) {
        return <div className="text-sm text-muted">Notizen werden geladen…</div>;
    }
    return (
        <div className="space-y-4" data-testid="learning-notes-panel">
            <p className="text-sm text-muted">Deine Notiz wird automatisch gespeichert.</p>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Eigene Notizen</label>
            <textarea
                className="min-h-44 w-full rounded-xl border border-soft bg-surface-elevated p-3 text-base md:text-sm text-primary"
                placeholder="Schreibe alles auf, was dir beim Merken hilft…"
                value={draft.mainNotes}
                onChange={(event) => onChange(event.target.value)}
            />
            {saveStateText ? <span className="text-xs text-muted">{saveStateText}</span> : null}
        </div>
    );
}
