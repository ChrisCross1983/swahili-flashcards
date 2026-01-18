"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CardEditorSheet, { CardEditorCard } from "@/components/CardEditorSheet";
import { createPortal } from "react-dom";

const IMAGE_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-images`;
const AUDIO_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-audio`;

type CardResult = {
    id: string | number;
    german_text: string;
    swahili_text: string;
    image_path: string | null;
    audio_path: string | null;
};

type Props = {
    ownerKey: string;
};

function getImageUrl(path: string) {
    return `${IMAGE_BASE_URL}/${path}`;
}

function getAudioUrl(path: string) {
    return `${AUDIO_BASE_URL}/${path}`;
}

export default function GlobalQuickSearch({ ownerKey }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<CardResult[]>([]);
    const [selected, setSelected] = useState<CardResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [editingCardId, setEditingCardId] = useState<string | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);

    const closeOverlay = useCallback(() => {
        setIsOpen(false);
        setQuery("");
        setResults([]);
        setSelected(null);
        setError(null);
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                if (editorOpen) {
                    setEditorOpen(false);
                    setEditingCardId(null);
                } else {
                    closeOverlay();
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, closeOverlay, editorOpen]);

    useEffect(() => {
        const handleHotkey = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                setIsOpen(true);
            }
        };

        document.addEventListener("keydown", handleHotkey);
        return () => document.removeEventListener("keydown", handleHotkey);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        inputRef.current?.focus();
    }, [isOpen]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!isOpen) return;

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
                    `/api/cards?ownerKey=${ownerKey}&q=${encodeURIComponent(trimmed)}`,
                    { signal: controller.signal }
                );

                if (!response.ok) {
                    throw new Error("Search failed");
                }

                const data = (await response.json()) as { cards?: CardResult[] };
                const cards = Array.isArray(data.cards) ? data.cards : [];
                setResults(cards.slice(0, 10));
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
    }, [query, ownerKey, isOpen]);

    const handleEdit = useCallback((card: CardResult) => {
        setIsOpen(false);

        setEditingCardId(String(card.id));
        setEditorOpen(true);
    }, []);


    const handleSaved = useCallback((updated: CardEditorCard) => {
        setResults((prev) =>
            prev.map((card) =>
                String(card.id) === String(updated.id)
                    ? {
                        ...card,
                        german_text: updated.german_text,
                        swahili_text: updated.swahili_text,
                        image_path: updated.image_path,
                        audio_path: updated.audio_path,
                    }
                    : card
            )
        );
        setSelected((prev) =>
            prev && String(prev.id) === String(updated.id)
                ? {
                    ...prev,
                    german_text: updated.german_text,
                    swahili_text: updated.swahili_text,
                    image_path: updated.image_path,
                    audio_path: updated.audio_path,
                }
                : prev
        );
    }, []);

    const handleDeleted = useCallback((id: string) => {
        setResults((prev) => prev.filter((card) => String(card.id) !== String(id)));
        setSelected((prev) => (prev && String(prev.id) === String(id) ? null : prev));
    }, []);

    if (!mounted || !document?.body) {
        return null;
    }

    return createPortal(
        <>
            <button
                type="button"
                aria-label="Quick Search"
                className="fixed bottom-6 right-6 z-[2147483647] flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg transition hover:scale-105 hover:bg-amber-600 active:scale-95"
                onClick={() => setIsOpen(true)}
            >
                <span className="text-xl">🔎</span>
            </button>

            {isOpen ? (
                <div
                    className="fixed inset-0 z-[2147483646] flex items-start justify-center bg-black/40 p-4 sm:items-center"
                    onClick={closeOverlay}
                >
                    <div
                        className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold">Quick Search</h2>
                                <p className="text-xs text-gray-500">Finde Karten ohne Navigation.</p>
                            </div>
                            <button
                                type="button"
                                aria-label="Close"
                                className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-500 transition hover:bg-gray-100"
                                onClick={closeOverlay}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex flex-col gap-3">
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Deutsch oder Swahili suchen..."
                                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:outline-none"
                            />

                            <div className="max-h-72 overflow-auto rounded-xl border border-gray-100 bg-gray-50">
                                {isLoading ? (
                                    <div className="p-4 text-sm text-gray-500">Suche...</div>
                                ) : error ? (
                                    <div className="p-4 text-sm text-red-500">{error}</div>
                                ) : results.length === 0 && query.trim() ? (
                                    <div className="p-4 text-sm text-gray-500">Keine Ergebnisse gefunden.</div>
                                ) : results.length === 0 ? (
                                    <div className="p-4 text-sm text-gray-500">Tippe, um Karten zu finden.</div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {results.map((card) => (
                                            <button
                                                key={card.id}
                                                type="button"
                                                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-white"
                                                onClick={() => setSelected(card)}
                                            >
                                                {card.image_path ? (
                                                    <img
                                                        src={getImageUrl(card.image_path)}
                                                        alt="Vorschau"
                                                        className="h-10 w-10 rounded-lg border object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-gray-100 text-xs text-gray-400">
                                                        –
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="font-medium text-gray-900">{card.german_text}</div>
                                                    <div className="text-gray-500">{card.swahili_text}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {selected ? (
                                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="mb-3 flex items-start justify-between">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{selected.german_text}</p>
                                            <p className="text-sm text-gray-500">{selected.swahili_text}</p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                                                onClick={() => handleEdit(selected)}
                                            >
                                                Bearbeiten
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Vorschau schließen"
                                                className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-100"
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
                                            className="mb-3 w-full max-h-56 rounded-xl object-contain bg-white"
                                        />
                                    ) : null}

                                    {selected.audio_path ? (
                                        <audio controls src={getAudioUrl(selected.audio_path)} className="w-full" />
                                    ) : (
                                        <p className="text-xs text-gray-400">Kein Audio verfügbar.</p>
                                    )}

                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}

            {editorOpen ? (
                <CardEditorSheet
                    ownerKey={ownerKey}
                    open={editorOpen}
                    cardId={editingCardId}
                    initialCard={
                        selected
                            ? {
                                id: String(selected.id),
                                german_text: selected.german_text,
                                swahili_text: selected.swahili_text,
                                image_path: selected.image_path,
                                audio_path: selected.audio_path,
                            }
                            : null
                    }
                    onClose={() => {
                        setEditorOpen(false);
                        setEditingCardId(null);
                        setIsOpen(true);
                    }}

                    onSaved={handleSaved}
                    onDeleted={handleDeleted}
                />
            ) : null}
        </>,
        document.body
    );
}