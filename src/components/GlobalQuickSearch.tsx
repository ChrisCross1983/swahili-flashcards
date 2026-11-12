"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import CardText from "@/components/ui/CardText";
import TrainerCardFormSheet, { type TrainerCardFormSheetHandle } from "@/components/trainer/TrainerCardFormSheet";
import CardDetailSheet from "@/components/trainer/CardDetailSheet";
import { fetchGroups } from "@/lib/groups/api";
import { blurActiveOverlayElement, lockBodyScroll, unlockBodyScroll } from "@/lib/ui/overlayLock";
import type { Group } from "@/lib/groups/types";
import type { WordEnrichment } from "@/lib/word/understanding";

const IMAGE_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-images`;

type CardResult = {
    id: string | number;
    german_text: string;
    swahili_text: string;
    german_example?: string | null;
    swahili_example?: string | null;
    has_note?: boolean;
    word_enrichment?: WordEnrichment | null;
    image_path: string | null;
    audio_path: string | null;
    groups?: Group[];
    type?: "vocab" | "sentence" | null;
};

type Props = {
    ownerKey: string;
    open: boolean;
    onClose: () => void;
    onOpen: () => void;
};

function getImageUrl(path: string) {
    return `${IMAGE_BASE_URL}/${path}`;
}

export default function GlobalQuickSearch({ ownerKey, open, onClose, onOpen }: Props) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<CardResult[]>([]);
    const [detailCard, setDetailCard] = useState<CardResult | null>(null);
    const [formCardType, setFormCardType] = useState<"vocab" | "sentence">("vocab");
    const [pendingEdit, setPendingEdit] = useState<CardResult | null>(null);
    const [pendingCreate, setPendingCreate] = useState(false);
    const [knownCards, setKnownCards] = useState<CardResult[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editStatus, setEditStatus] = useState<string | null>(null);
    const cardFormRef = useRef<TrainerCardFormSheetHandle | null>(null);
    const detailOriginRef = useRef<{ card: CardResult; note: string | null } | null>(null);

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
        setDetailCard(null);
        detailOriginRef.current = null;
        setError(null);
        setEditStatus(null);
        onClose();
    }, [onClose]);

    const hideSearchForEdit = useCallback(() => {
        blurActiveOverlayElement();
        setError(null);
        onClose();
    }, [onClose]);

    const resetSearchAfterCreate = useCallback(() => {
        setQuery("");
        setResults([]);
        setDetailCard(null);
        setError(null);
        setEditStatus(null);
    }, []);

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
            } catch {
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
        const nextGroups = await fetchGroups(formCardType);
        setGroups(nextGroups);
        return nextGroups;
    }, [groups, formCardType]);

    useEffect(() => {
        if (!pendingEdit) return;
        cardFormRef.current?.openEdit(pendingEdit, "cards");
        setPendingEdit(null);
    }, [pendingEdit, formCardType]);

    useEffect(() => {
        if (!pendingCreate || formCardType !== "vocab") return;
        cardFormRef.current?.openCreate();
        setPendingCreate(false);
    }, [pendingCreate, formCardType]);

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

    const handleEdit = useCallback(async (card: CardResult, note: string | null) => {
        setEditStatus(null);
        hideSearchForEdit();
        setDetailCard(null);
        detailOriginRef.current = { card, note };

        try {
            const response = await fetch(`/api/cards?id=${encodeURIComponent(String(card.id))}`, { cache: "no-store" });
            const json = await response.json();
            if (!response.ok) throw new Error(json?.error ?? "Karte konnte nicht geladen werden.");
            const loadedCard = json.card as CardResult | null;
            if (!loadedCard) throw new Error("Karte nicht gefunden.");
            const nextType = loadedCard.type === "sentence" ? "sentence" : "vocab";
            setGroups(await fetchGroups(nextType));
            setFormCardType(nextType);
            detailOriginRef.current = { card: loadedCard, note };
            mergeKnownCard(loadedCard);
            setPendingEdit(loadedCard);
        } catch (error) {
            detailOriginRef.current = null;
            setEditStatus(error instanceof Error ? error.message : "Karte konnte nicht geladen werden.");
            onOpen();
        }
    }, [hideSearchForEdit, mergeKnownCard, onOpen]);

    const handleCreateFromSearch = useCallback(() => {
        const searchTerm = query.trim();
        if (!searchTerm) return;
        detailOriginRef.current = null;
        hideSearchForEdit();
        void fetchGroups("vocab").then((vocabGroups) => {
            setGroups(vocabGroups);
            setFormCardType("vocab");
            setPendingCreate(true);
        }).catch(() => { setEditStatus("Gruppen konnten nicht geladen werden."); onOpen(); });
    }, [hideSearchForEdit, onOpen, query]);

    const handleSaved = useCallback((updated: CardResult, nextGroups?: Group[]) => {
        const updatedWithGroups = nextGroups ? { ...updated, groups: nextGroups } : updated;
        if (detailOriginRef.current && String(detailOriginRef.current.card.id) === String(updated.id)) {
            detailOriginRef.current = { ...detailOriginRef.current, card: { ...detailOriginRef.current.card, ...updatedWithGroups } };
        }
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
        mergeKnownCard(updatedWithGroups);
    }, [mergeKnownCard]);

    const handleDeleted = useCallback((id: string) => {
        if (detailOriginRef.current && String(detailOriginRef.current.card.id) === id) { detailOriginRef.current = null; onOpen(); }
        setResults((prev) => prev.filter((card) => String(card.id) !== String(id)));
        setDetailCard((prev) => (prev && String(prev.id) === String(id) ? null : prev));
        setKnownCards((prev) => prev.filter((card) => String(card.id) !== String(id)));
    }, [onOpen]);

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
                                                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                                                onClick={() => { setDetailCard(card); onClose(); }}
                                                aria-label={`Karte ansehen: ${card.german_text}`}
                                            >
                                                {card.image_path ? (
                                                     <Image
                                                        src={getImageUrl(card.image_path)}
                                                        alt="Vorschau"
                                                         width={40} height={40} unoptimized
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
                                                <span className="ml-auto text-lg text-muted" aria-hidden="true">›</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {query.trim() ? (
                                <button
                                    type="button"
                                    className="inline-flex min-h-11 items-center justify-center self-start rounded-full border border-soft bg-surface px-4 py-2 text-sm font-medium text-primary transition hover:border-accent hover:bg-surface-elevated"
                                    onClick={handleCreateFromSearch}
                                >
                                    + Neues Wort anlegen
                                </button>
                            ) : null}

                        </div>
                    </div>
                </div>
            ) : null}

             {detailCard ? <CardDetailSheet key={String(detailCard.id)} card={detailCard} initialNote={detailOriginRef.current?.note ?? null} onClose={() => { setDetailCard(null); detailOriginRef.current = null; onOpen(); }} onEdit={(card, note) => void handleEdit(card as CardResult, note)} onWordUnderstandingSaved={(cardId, enrichment) => {
                const apply = (card: CardResult) => String(card.id) === cardId ? { ...card, word_enrichment: enrichment } : card;
                setResults((prev) => prev.map(apply));
                setKnownCards((prev) => prev.map(apply));
                setDetailCard((prev) => prev ? apply(prev) : prev);
                 if (detailOriginRef.current && String(detailOriginRef.current.card.id) === cardId) detailOriginRef.current = { ...detailOriginRef.current, card: apply(detailOriginRef.current.card) };
             }} /> : null}
            <TrainerCardFormSheet
                key={formCardType}
                ref={cardFormRef}
                cardType={formCardType}
                closeOnCreateSuccess
                onCreateFlowComplete={resetSearchAfterCreate}
                editTitle={formCardType === "sentence" ? "Satz bearbeiten" : "Karte bearbeiten"}
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
                    setDetailCard((prev) => prev ? applyAudio(prev) : prev);
                    if (detailOriginRef.current && String(detailOriginRef.current.card.id) === String(cardId)) detailOriginRef.current = { ...detailOriginRef.current, card: applyAudio(detailOriginRef.current.card) };
                }}
                onNoteSaved={(cardId, mainNotes) => {
                    const hasNote = mainNotes.trim().length > 0;
                    const applyNote = (card: CardResult) => String(card.id) === cardId ? { ...card, has_note: hasNote } : card;
                    setResults((prev) => prev.map(applyNote));
                    setKnownCards((prev) => prev.map(applyNote));
                    setDetailCard((prev) => prev ? applyNote(prev) : prev);
                    if (detailOriginRef.current && String(detailOriginRef.current.card.id) === cardId) detailOriginRef.current = { card: applyNote(detailOriginRef.current.card), note: mainNotes };
                }}
                onWordUnderstandingSaved={(cardId, enrichment) => {
                    const applyExplanation = (card: CardResult) => String(card.id) === cardId ? { ...card, word_enrichment: enrichment } : card;
                    setResults((prev) => prev.map(applyExplanation));
                    setKnownCards((prev) => prev.map(applyExplanation));
                    setDetailCard((prev) => prev ? applyExplanation(prev) : prev);
                    if (detailOriginRef.current && String(detailOriginRef.current.card.id) === cardId) detailOriginRef.current = { ...detailOriginRef.current, card: applyExplanation(detailOriginRef.current.card) };
                }}
                onOpenCards={() => { if (detailOriginRef.current) setDetailCard({ ...detailOriginRef.current.card }); }}
                onReturnToLearn={() => { }}
                onStatus={setEditStatus}
            />
        </>,
        document.body
    );
}
