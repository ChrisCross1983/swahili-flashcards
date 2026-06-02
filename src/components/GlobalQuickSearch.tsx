"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CardText from "@/components/ui/CardText";
import TrainerCardFormSheet, { type TrainerCardFormSheetHandle } from "@/components/trainer/TrainerCardFormSheet";
import { fetchGroups } from "@/lib/groups/api";
import { blurActiveOverlayElement, lockBodyScroll, unlockBodyScroll } from "@/lib/ui/overlayLock";
import type { Group } from "@/lib/groups/types";

const IMAGE_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-images`;
const AUDIO_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-audio`;

type CardResult = {
    id: string | number;
    german_text: string;
    swahili_text: string;
    german_example?: string | null;
    swahili_example?: string | null;
    image_path: string | null;
    audio_path: string | null;
    groups?: Group[];
    type?: "vocab" | "sentence" | null;
};

type Props = {
    ownerKey: string;
    open: boolean;
    onClose: () => void;
};

function getImageUrl(path: string) {
    return `${IMAGE_BASE_URL}/${path}`;
}

function getAudioUrl(path: string) {
    return `${AUDIO_BASE_URL}/${path}`;
}

export default function GlobalQuickSearch({ ownerKey, open, onClose }: Props) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<CardResult[]>([]);
    const [selected, setSelected] = useState<CardResult | null>(null);
    const [knownCards, setKnownCards] = useState<CardResult[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editStatus, setEditStatus] = useState<string | null>(null);
    const cardFormRef = useRef<TrainerCardFormSheetHandle | null>(null);

    const mergeKnownCard = useCallback((card: CardResult) => {
        setKnownCards((prev) => {
            const withoutExisting = prev.filter((entry) => String(entry.id) !== String(card.id));
            return [card, ...withoutExisting].slice(0, 30);
        });
    }, []);

    const closeOverlay = useCallback(() => {
        blurActiveOverlayElement();
        setQuery("");
        setResults([]);
        setSelected(null);
        setError(null);
        setEditStatus(null);
        onClose();
    }, [onClose]);

    const hideSearchForEdit = useCallback(() => {
        blurActiveOverlayElement();
        setError(null);
        onClose();
    }, [onClose]);

    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeOverlay();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, closeOverlay]);

    useEffect(() => {
        const handleHotkey = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
            }
        };

        document.addEventListener("keydown", handleHotkey);
        return () => document.removeEventListener("keydown", handleHotkey);
    }, []);

    useEffect(() => {
        if (!open) return;
        lockBodyScroll();

        return () => {
            unlockBodyScroll();
        };
    }, [open]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open) return;

        const trimmed = query.trim();
        setSelected(null);

        if (!trimmed) {
            setResults([]);
            setError(null);
            return;
        }

        const controller = new AbortController();
        const timeout = window.setTimeout(async () => {
            try {
                setIsLoading(true);
                const response = await fetch(
                    `/api/cards?q=${encodeURIComponent(trimmed)}`,
                    { signal: controller.signal }
                );

                if (!response.ok) {
                    throw new Error("Search failed");
                }

                const data = (await response.json()) as { cards?: CardResult[] };
                const cards = Array.isArray(data.cards) ? data.cards : [];
                setResults(cards.slice(0, 10));
                setKnownCards((prev) => {
                    const merged = new Map<string, CardResult>();
                    for (const card of prev) merged.set(String(card.id), card);
                    for (const card of cards.slice(0, 10)) merged.set(String(card.id), card);
                    return Array.from(merged.values()).slice(0, 30);
                });
                setError(null);
            } catch (err) {
                if (controller.signal.aborted) return;
                setError("Suche fehlgeschlagen.");
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        }, 250);

        return () => {
            controller.abort();
            window.clearTimeout(timeout);
        };
    }, [query, ownerKey, open]);

    const ensureGroupsLoaded = useCallback(async () => {
        if (groups.length > 0) return groups;
        const nextGroups = await fetchGroups("vocab");
        setGroups(nextGroups);
        return nextGroups;
    }, [groups]);

    useEffect(() => {
        let ignore = false;
        async function loadGroups() {
            try {
                const nextGroups = await ensureGroupsLoaded();
                if (!ignore) setGroups(nextGroups);
            } catch {
                if (!ignore) setEditStatus("Gruppen konnten nicht geladen werden.");
            }
        }

        if (mounted && open) void loadGroups();
        return () => {
            ignore = true;
        };
    }, [ensureGroupsLoaded, mounted, open]);

    const handleEdit = useCallback(async (card: CardResult) => {
        setEditStatus(null);
        hideSearchForEdit();

        try {
            await ensureGroupsLoaded();
            const response = await fetch(`/api/cards?id=${encodeURIComponent(String(card.id))}&type=vocab`, { cache: "no-store" });
            const json = await response.json();
            if (!response.ok) throw new Error(json?.error ?? "Karte konnte nicht geladen werden.");
            const loadedCard = json.card ?? card;
            mergeKnownCard(loadedCard);
            cardFormRef.current?.openEdit(loadedCard, "cards");
        } catch (error) {
            setEditStatus(error instanceof Error ? error.message : "Karte konnte nicht geladen werden.");
            mergeKnownCard(card);
            cardFormRef.current?.openEdit(card, "cards");
        }
    }, [ensureGroupsLoaded, hideSearchForEdit, mergeKnownCard]);

    const handleSaved = useCallback((updated: CardResult, nextGroups?: Group[]) => {
        const updatedWithGroups = nextGroups ? { ...updated, groups: nextGroups } : updated;
        setResults((prev) =>
            prev.map((card) =>
                String(card.id) === String(updatedWithGroups.id)
                    ? {
                        ...card,
                        german_text: updatedWithGroups.german_text,
                        swahili_text: updatedWithGroups.swahili_text,
                        german_example: updatedWithGroups.german_example,
                        swahili_example: updatedWithGroups.swahili_example,
                        image_path: updatedWithGroups.image_path,
                        audio_path: updatedWithGroups.audio_path,
                        groups: updatedWithGroups.groups ?? card.groups,
                    }
                    : card
            )
        );
        setSelected((prev) =>
            prev && String(prev.id) === String(updatedWithGroups.id)
                ? {
                    ...prev,
                    german_text: updatedWithGroups.german_text,
                    swahili_text: updatedWithGroups.swahili_text,
                    german_example: updatedWithGroups.german_example,
                    swahili_example: updatedWithGroups.swahili_example,
                    image_path: updatedWithGroups.image_path,
                    audio_path: updatedWithGroups.audio_path,
                    groups: updatedWithGroups.groups ?? prev.groups,
                }
                : prev
        );
        mergeKnownCard(updatedWithGroups);
    }, [mergeKnownCard]);

    const handleDeleted = useCallback((id: string) => {
        setResults((prev) => prev.filter((card) => String(card.id) !== String(id)));
        setSelected((prev) => (prev && String(prev.id) === String(id) ? null : prev));
        setKnownCards((prev) => prev.filter((card) => String(card.id) !== String(id)));
    }, []);

    if (!mounted || !document?.body) {
        return null;
    }

    return createPortal(
        <>
            {open ? (
                <div
                    className="fixed inset-0 z-[2147483646] flex items-start justify-center bg-overlay p-4 sm:items-center"
                    onClick={closeOverlay}
                >
                    <div
                        className="w-full max-w-xl rounded-2xl border border-soft bg-surface-elevated p-4 shadow-warm"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold">Quick Search</h2>
                                <p className="text-xs text-muted">Finde Karten ohne Navigation.</p>
                            </div>
                            <button
                                type="button"
                                aria-label="Close"
                                className="rounded-full border border-soft px-3 py-1 text-sm text-muted transition hover:bg-surface"
                                onClick={closeOverlay}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex flex-col gap-3">
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Deutsch oder Swahili suchen..."
                                className="w-full rounded-xl border border-soft px-4 py-3 text-base md:text-sm shadow-soft focus:border-accent focus:outline-none"
                            />

                            {editStatus ? (
                                <div className="rounded-xl border border-soft bg-surface p-3 text-sm text-muted" aria-live="polite">
                                    {editStatus}
                                </div>
                            ) : null}

                            <div className="max-h-72 overflow-auto rounded-xl border border-soft bg-surface">
                                {isLoading ? (
                                    <div className="p-4 text-sm text-muted">Suche...</div>
                                ) : error ? (
                                    <div className="p-4 text-sm text-accent-cta">{error}</div>
                                ) : results.length === 0 && query.trim() ? (
                                    <div className="p-4 text-sm text-muted">Keine Ergebnisse gefunden.</div>
                                ) : results.length === 0 ? (
                                    <div className="p-4 text-sm text-muted">Tippe, um Karten zu finden.</div>
                                ) : (
                                    <div className="divide-y divide-[color:var(--border)]">
                                        {results.map((card) => (
                                            <button
                                                key={card.id}
                                                type="button"
                                                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-surface"
                                                onClick={() => setSelected(card)}
                                            >
                                                {card.image_path ? (
                                                    <img
                                                        src={getImageUrl(card.image_path)}
                                                        alt="Vorschau"
                                                        className="h-10 w-10 rounded-lg border object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-soft bg-surface text-xs text-muted">
                                                        –
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <CardText className="font-medium text-primary">{card.german_text}</CardText>
                                                    <CardText className="text-muted">{card.swahili_text}</CardText>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {selected ? (
                                <div className="rounded-2xl border border-soft bg-surface p-4 shadow-soft" data-testid="quick-search-card-preview">
                                    <div className="mb-3 flex items-start justify-between">
                                        <div className="min-w-0">
                                            <CardText className="text-sm font-semibold text-primary">{selected.german_text}</CardText>
                                            <CardText className="text-sm text-muted">{selected.swahili_text}</CardText>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="rounded-full border border-soft px-3 py-1 text-xs text-muted transition hover:border-accent hover:bg-surface"
                                                onClick={() => handleEdit(selected)}
                                            >
                                                Bearbeiten
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Vorschau schließen"
                                                className="rounded-full border border-soft px-2 py-1 text-xs text-muted transition hover:bg-surface"
                                                onClick={() => setSelected(null)}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>

                                    {selected.image_path ? (
                                        <img
                                            src={getImageUrl(selected.image_path)}
                                            alt="Karte"
                                            className="mb-3 w-full max-h-56 rounded-xl object-contain bg-surface-elevated"
                                        />
                                    ) : null}

                                    {selected.audio_path ? (
                                        <audio controls src={getAudioUrl(selected.audio_path)} className="w-full" />
                                    ) : (
                                        <p className="text-xs text-muted">Kein Audio verfügbar.</p>
                                    )}

                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}

            <TrainerCardFormSheet
                ref={cardFormRef}
                cardType="vocab"
                editTitle="Karte bearbeiten"
                createTitle="Neue Karte"
                saveCardLabel="Speichern"
                groups={groups}
                cards={knownCards}
                onGroupsChange={setGroups}
                onCreated={(card) => mergeKnownCard(card)}
                onUpdated={(card, nextGroups) => handleSaved(card, nextGroups)}
                onDeleted={(cardId) => handleDeleted(cardId)}
                onAudioUpdated={(cardId, audioPath) => {
                    const applyAudio = (card: CardResult) => String(card.id) === String(cardId) ? { ...card, audio_path: audioPath } : card;
                    setResults((prev) => prev.map(applyAudio));
                    setKnownCards((prev) => prev.map(applyAudio));
                    setSelected((prev) => prev ? applyAudio(prev) : prev);
                }}
                onOpenCards={() => { }}
                onReturnToLearn={() => { }}
                onStatus={setEditStatus}
            />
        </>,
        document.body
    );
}
