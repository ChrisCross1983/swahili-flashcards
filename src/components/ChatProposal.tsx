"use client";

import { useEffect, useState } from "react";
import type { CardProposal, ProposalStatus } from "@/lib/cards/proposals";

type Props = {
    proposal: CardProposal;
    status: ProposalStatus;
    onUpdate: (update: Partial<CardProposal>) => void;
    onSave: () => void;
    onDiscard: () => void;
    onSwap: () => void;
};

export default function ChatProposal({
    proposal,
    status,
    onUpdate,
    onSave,
    onDiscard,
    onSwap,
}: Props) {
    const [editing, setEditing] = useState(false);
    const [front, setFront] = useState(proposal.front_text);
    const [back, setBack] = useState(proposal.back_text);

    useEffect(() => {
        setFront(proposal.front_text);
        setBack(proposal.back_text);
    }, [proposal.back_text, proposal.front_text]);

    const missingBack =
        Boolean(proposal.missing_back) || proposal.back_text.trim().length === 0;
    const isSaving = status.state === "saving";

    function handleFrontChange(value: string) {
        setFront(value);
        onUpdate({
            front_text: value,
            missing_back: missingBack,
        });
    }

    function handleBackChange(value: string) {
        setBack(value);
        const nextMissing = value.trim().length === 0;
        onUpdate({
            back_text: value,
            missing_back: nextMissing,
        });
    }

    return (
        <div className="rounded-2xl border border-soft bg-surface p-3 shadow-soft">
            <div className="flex items-center justify-between text-xs text-muted">
                <span className="uppercase">{proposal.type === "sentence" ? "Satz" : "Vokabel"}</span>
                <span className="rounded-full border border-soft px-2 py-0.5">
                    {proposal.front_lang.toUpperCase()} → {proposal.back_lang.toUpperCase()}
                </span>
            </div>

            {editing ? (
                <div className="mt-3 flex flex-col gap-2">
                    <label className="text-xs text-muted">Swahili (Vorderseite)</label>
                    <input
                        className="rounded-xl border px-3 py-2 text-sm"
                        value={front}
                        onChange={(event) => handleFrontChange(event.target.value)}
                        placeholder="Swahili"
                    />
                    <label className="text-xs text-muted">Deutsch (Rückseite)</label>
                    <input
                        className="rounded-xl border px-3 py-2 text-sm"
                        value={back}
                        onChange={(event) => handleBackChange(event.target.value)}
                        placeholder="Deutsch"
                    />
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded-xl border px-3 py-2 text-sm"
                            onClick={() => setEditing(false)}
                        >
                            Fertig
                        </button>
                        <button
                            type="button"
                            className="rounded-xl border px-3 py-2 text-sm"
                            onClick={onSwap}
                        >
                            🔁 Tauschen
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-3">
                    <div className="text-sm font-medium">{proposal.front_text || "—"}</div>
                    <div className="text-sm text-muted">{proposal.back_text || "Übersetzung fehlt"}</div>
                    {proposal.source_context_snippet ? (
                        <div className="mt-2 text-xs text-muted">
                            Kontext: {proposal.source_context_snippet}
                        </div>
                    ) : null}
                    {proposal.tags && proposal.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1 text-xs text-muted">
                            {proposal.tags.map((tag) => (
                                <span key={tag} className="rounded-full border border-soft px-2 py-0.5">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    {proposal.notes ? (
                        <div className="mt-2 text-xs text-muted">Notiz: {proposal.notes}</div>
                    ) : null}
                </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
                {missingBack ? (
                    <button
                        type="button"
                        className="rounded-xl bg-accent-primary px-3 py-2 text-sm text-on-accent"
                        onClick={() => setEditing(true)}
                    >
                        ➕ Übersetzung ergänzen
                    </button>
                ) : (
                    <button
                        type="button"
                        className="rounded-xl bg-accent-primary px-3 py-2 text-sm text-on-accent disabled:opacity-60"
                        disabled={isSaving}
                        onClick={onSave}
                    >
                        {isSaving ? "Speichere…" : "✅ Speichern"}
                    </button>
                )}
                <button
                    type="button"
                    className="rounded-xl border px-3 py-2 text-sm"
                    onClick={() => setEditing(true)}
                >
                    ✏️ Bearbeiten
                </button>
                <button
                    type="button"
                    className="rounded-xl border px-3 py-2 text-sm"
                    onClick={onSwap}
                >
                    🔁 Tauschen
                </button>
                <button
                    type="button"
                    className="rounded-xl border px-3 py-2 text-sm text-muted"
                    onClick={onDiscard}
                >
                    ❌ Verwerfen
                </button>
            </div>

            {status.state === "saved" ? (
                <div className="mt-3 rounded-xl border border-soft bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    Gespeichert ✅
                </div>
            ) : null}
            {status.state === "exists" ? (
                <div className="mt-3 rounded-xl border border-soft bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Schon vorhanden ⚠️
                    <div className="mt-2 flex gap-2">
                        <button
                            type="button"
                            className="rounded-xl border px-3 py-1 text-xs"
                            onClick={onDiscard}
                        >
                            Ok
                        </button>
                    </div>
                </div>
            ) : null}
            {status.state === "error" ? (
                <div className="mt-3 rounded-xl border border-cta bg-accent-cta-soft px-3 py-2 text-sm text-accent-cta">
                    {status.message} ❌
                    <div className="mt-2 flex gap-2">
                        <button
                            type="button"
                            className="rounded-xl border px-3 py-1 text-xs"
                            onClick={onSave}
                        >
                            Retry
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
