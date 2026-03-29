"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FullScreenSheet from "@/components/FullScreenSheet";
import ConfirmDialog from "@/components/ConfirmDialog";
import CardText from "@/components/ui/CardText";
import type { CardType } from "@/lib/trainer/types";
import { validateClusterDeletionSelection, type DuplicateCluster } from "@/lib/cards/duplicates";

type ScanResponse = {
    clusters: DuplicateCluster[];
    summary: {
        strict: number;
        review: number;
        totalCards: number;
    };
};

type Props = {
    open: boolean;
    cardType: CardType;
    onClose: () => void;
    onDeleted: () => Promise<void>;
};

function badgeLabel(kind: DuplicateCluster["kind"]): string {
    switch (kind) {
        case "exact":
            return "Exakt";
        case "normalized":
            return "Normalisiert";
        case "direction_swapped":
            return "Richtung vertauscht";
        case "qualified_duplicate":
            return "Didaktische Variante";
        default:
            return "Verdächtig ähnlich";
    }
}

export default function DuplicateReviewSheet({ open, cardType, onClose, onDeleted }: Props) {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [clusters, setClusters] = useState<DuplicateCluster[]>([]);
    const [selectedDeleteIds, setSelectedDeleteIds] = useState<Record<string, Set<string>>>({});
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const strictClusters = useMemo(() => clusters.filter((cluster) => cluster.mode === "strict"), [clusters]);
    const reviewClusters = useMemo(() => clusters.filter((cluster) => cluster.mode === "review"), [clusters]);

    const selectedCount = useMemo(
        () => Object.values(selectedDeleteIds).reduce((sum, set) => sum + set.size, 0),
        [selectedDeleteIds]
    );

    const loadDuplicates = useCallback(async () => {
        setLoading(true);
        setStatus(null);
        try {
            const res = await fetch(`/api/cards/duplicates?mode=all&type=${encodeURIComponent(cardType)}`);
            const json = (await res.json()) as Partial<ScanResponse> & { error?: string };
            if (!res.ok) {
                setStatus(json.error ?? "Duplikat-Scan fehlgeschlagen.");
                return;
            }

            const foundClusters = Array.isArray(json.clusters) ? json.clusters : [];
            setClusters(foundClusters);

            const defaults: Record<string, Set<string>> = {};
            for (const cluster of foundClusters) {
                const keepId = cluster.recommendation?.keepCardId ?? cluster.cards[0]?.id;
                defaults[cluster.clusterId] = new Set(cluster.cards.map((card) => card.id).filter((id) => id !== keepId));
            }
            setSelectedDeleteIds(defaults);
        } catch {
            setStatus("Duplikat-Scan fehlgeschlagen.");
        } finally {
            setLoading(false);
        }
    }, [cardType]);

    useEffect(() => {
        if (!open) return;
        void loadDuplicates();
    }, [open, loadDuplicates]);

    function toggleDelete(clusterId: string, cardId: string) {
        setSelectedDeleteIds((prev) => {
            const next = { ...prev };
            const currentSet = new Set(next[clusterId] ?? []);
            if (currentSet.has(cardId)) currentSet.delete(cardId);
            else currentSet.add(cardId);
            next[clusterId] = currentSet;
            return next;
        });
    }

    function validateBeforeDelete(): string | null {
        for (const cluster of clusters) {
            const selected = Array.from(selectedDeleteIds[cluster.clusterId] ?? []);
            const validation = validateClusterDeletionSelection(cluster, selected);
            if (validation) return `${validation} (Cluster ${cluster.clusterId})`;
        }
        return null;
    }

    async function deleteSelected() {
        const selectedIds = Array.from(
            new Set(
                Object.values(selectedDeleteIds)
                    .flatMap((value) => Array.from(value))
            )
        );

        if (!selectedIds.length) {
            setStatus("Keine Karten zum Löschen ausgewählt.");
            return;
        }

        const validationError = validateBeforeDelete();
        if (validationError) {
            setStatus(validationError);
            return;
        }

        setDeleting(true);
        setStatus(null);

        try {
            const res = await fetch("/api/cards/duplicates/delete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ cardIds: selectedIds }),
            });
            const json = (await res.json()) as { error?: string; deletedCount?: number };

            if (!res.ok) {
                setStatus(json.error ?? "Löschen fehlgeschlagen.");
                return;
            }

            await onDeleted();
            await loadDuplicates();
            setStatus(`${json.deletedCount ?? selectedIds.length} Karte(n) gelöscht.`);
        } catch {
            setStatus("Löschen fehlgeschlagen.");
        } finally {
            setDeleting(false);
        }
    }

    return (
        <>
            <FullScreenSheet open={open} onClose={onClose} title="Duplikate prüfen">
                <div className="space-y-4">
                    <div className="rounded-xl border bg-surface p-3 text-sm">
                        <p>
                            Strikte Dubletten (inkl. didaktischer Varianten): <strong>{strictClusters.length}</strong> · Verdächtige Kandidaten: <strong>{reviewClusters.length}</strong>
                        </p>
                        <p className="mt-1 text-xs text-muted">
                            Verdächtige Treffer sind nur Review-Kandidaten und werden nie automatisch gelöscht.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => void loadDuplicates()} disabled={loading}>
                            {loading ? "Scanne…" : "Neu scannen"}
                        </button>
                        <button
                            type="button"
                            className="rounded-xl bg-accent-cta px-3 py-2 text-sm text-on-accent disabled:opacity-60"
                            onClick={() => setConfirmOpen(true)}
                            disabled={deleting || selectedCount === 0 || clusters.length === 0}
                        >
                            {deleting ? "Löscht…" : `${selectedCount} ausgewählte löschen`}
                        </button>
                    </div>

                    {status ? <p className="rounded-xl border bg-surface p-3 text-sm">{status}</p> : null}

                    {!loading && clusters.length === 0 ? (
                        <div className="rounded-xl border bg-surface p-4 text-sm text-muted">
                            Keine Dubletten gefunden. Deine Karten sehen sauber aus. 🎉
                        </div>
                    ) : null}

                    {strictClusters.length > 0 ? (
                        <section className="space-y-3">
                            <h3 className="text-sm font-semibold">Echte Dubletten</h3>
                            {strictClusters.map((cluster) => (
                                <div key={cluster.clusterId} className="rounded-xl border bg-surface p-3 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="rounded-full border px-2 py-0.5 text-xs">{badgeLabel(cluster.kind)}</span>
                                        <span className="text-xs text-muted">{cluster.clusterId}</span>
                                    </div>
                                    <p className="text-xs text-muted">{cluster.reason}</p>
                                    {cluster.recommendation ? (
                                        <p className="text-xs text-muted">{cluster.recommendation.reason}</p>
                                    ) : null}
                                    <div className="space-y-2">
                                        {cluster.cards.map((card) => {
                                            const checked = selectedDeleteIds[cluster.clusterId]?.has(card.id) ?? false;
                                            return (
                                                <label key={card.id} className="flex items-start gap-3 rounded-lg border p-2 text-sm">
                                                    <input
                                                        type="checkbox"
                                                        className="mt-1"
                                                        checked={checked}
                                                        onChange={() => toggleDelete(cluster.clusterId, card.id)}
                                                    />
                                                    <div className="min-w-0">
                                                        <CardText>{card.german_text}</CardText>
                                                        <CardText className="text-muted">{card.swahili_text}</CardText>
                                                        <p className="text-xs text-muted mt-1">
                                                            ID: {card.id} · erstellt: {card.created_at ? new Date(card.created_at).toLocaleDateString("de-DE") : "–"}
                                                        </p>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </section>
                    ) : null}

                    {reviewClusters.length > 0 ? (
                        <section className="space-y-3">
                            <h3 className="text-sm font-semibold">Verdächtige ähnliche Karten</h3>
                            {reviewClusters.map((cluster) => (
                                <div key={cluster.clusterId} className="rounded-xl border bg-surface p-3 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="rounded-full border px-2 py-0.5 text-xs">{badgeLabel(cluster.kind)}</span>
                                        <span className="text-xs text-muted">{cluster.clusterId}</span>
                                    </div>
                                    <p className="text-xs text-muted">{cluster.reason}</p>
                                    <p className="text-xs text-muted">Bitte manuell prüfen, bevor du löschst.</p>
                                    {cluster.recommendation ? (
                                        <p className="text-xs text-muted">{cluster.recommendation.reason}</p>
                                    ) : null}
                                    <div className="space-y-2">
                                        {cluster.cards.map((card) => {
                                            const checked = selectedDeleteIds[cluster.clusterId]?.has(card.id) ?? false;
                                            return (
                                                <label key={card.id} className="flex items-start gap-3 rounded-lg border p-2 text-sm">
                                                    <input
                                                        type="checkbox"
                                                        className="mt-1"
                                                        checked={checked}
                                                        onChange={() => toggleDelete(cluster.clusterId, card.id)}
                                                    />
                                                    <div className="min-w-0">
                                                        <CardText>{card.german_text}</CardText>
                                                        <CardText className="text-muted">{card.swahili_text}</CardText>
                                                        <p className="text-xs text-muted mt-1">
                                                            ID: {card.id} · erstellt: {card.created_at ? new Date(card.created_at).toLocaleDateString("de-DE") : "–"}
                                                        </p>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </section>
                    ) : null}
                </div>
            </FullScreenSheet>

            <ConfirmDialog
                open={confirmOpen}
                title="Ausgewählte Karten löschen?"
                description="Diese Aktion löscht ausgewählte Karten und zugehörige Lern-/Gruppendaten endgültig."
                confirmLabel="Jetzt löschen"
                cancelLabel="Abbrechen"
                onCancel={() => setConfirmOpen(false)}
                onConfirm={() => {
                    setConfirmOpen(false);
                    void deleteSelected();
                }}
            />
        </>
    );
}
