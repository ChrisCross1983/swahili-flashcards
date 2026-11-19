"use client";

type CardNoteDraft = {
    mainNotes: string;
};

type Props = {
    loading: boolean;
    draft: CardNoteDraft;
    saveStateText: string | null;
    onChange: (value: string) => void;
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
    saveDisabled?: boolean;
};

export default function LearningHelpPanel({
    loading,
    draft,
    saveStateText,
    onChange,
    onSave,
    onCancel,
    saving,
    saveDisabled = false,
}: Props) {
    if (loading) {
        return <div className="text-sm text-muted">Notizen werden geladen…</div>;
    }

    return (
        <div className="space-y-3" data-testid="learning-notes-panel">
            <p className="text-xs text-muted">Änderungen werden erst mit „Speichern“ übernommen.</p>
            <label htmlFor="learning-note" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Notiz</label>
            <textarea
                id="learning-note"
                className="min-h-[220px] max-h-[min(58dvh,520px)] w-full resize-y rounded-xl border border-soft bg-surface-elevated p-3 text-base text-primary md:text-sm"
                placeholder="Kurze Merkhilfe, Stolperstein oder Eselsbrücke…"
                value={draft.mainNotes}
                onChange={(event) => onChange(event.target.value)}
            />
            {saveStateText ? <span role="status" className="text-xs text-muted">{saveStateText}</span> : null}
            <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn btn-primary min-h-11" disabled={saving || saveDisabled} onClick={onSave}>Speichern</button>
                <button type="button" className="btn btn-secondary min-h-11" disabled={saving} onClick={onCancel}>Abbrechen</button>
            </div>
        </div>
    );
}
