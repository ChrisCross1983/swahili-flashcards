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
        <div className="space-y-3" data-testid="learning-notes-panel">
            <p className="text-xs text-muted">Bleibt im Lernfluss und wird automatisch gespeichert.</p>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Notiz</label>
            <textarea
                className="min-h-28 w-full rounded-xl border border-soft bg-surface-elevated p-3 text-sm text-primary"
                placeholder="Kurze Merkhilfe, Stolperstein oder Eselsbrücke…"
                value={draft.mainNotes}
                onChange={(event) => onChange(event.target.value)}
            />
            {saveStateText ? <span className="text-xs text-muted">{saveStateText}</span> : null}
        </div>
    );
}
