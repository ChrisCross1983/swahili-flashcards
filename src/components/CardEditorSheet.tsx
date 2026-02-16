"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FullScreenSheet from "@/components/FullScreenSheet";

const IMAGE_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-images`;
const AUDIO_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-audio`;

export type CardEditorCard = {
    id: string;
    german_text: string;
    swahili_text: string;
    image_path: string | null;
    audio_path: string | null;
};

type Props = {
    ownerKey: string;
    open: boolean;
    cardId: string | null;
    initialCard?: CardEditorCard | null;
    onClose: () => void;
    onSaved?: (card: CardEditorCard) => void;
    onDeleted?: (id: string) => void;
};

export default function CardEditorSheet({
    ownerKey,
    open,
    cardId,
    initialCard,
    onClose,
    onSaved,
    onDeleted,
}: Props) {
    const [german, setGerman] = useState("");
    const [swahili, setSwahili] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [editAudioPath, setEditAudioPath] = useState<string | null>(null);
    const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
    const [suggestOpen, setSuggestOpen] = useState(false);
    const [suggestLoading, setSuggestLoading] = useState(false);
    const [suggestItems, setSuggestItems] = useState<any[]>([]);
    const [suggestError, setSuggestError] = useState<string | null>(null);
    const [suggestedImagePath, setSuggestedImagePath] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);

    const audioElRef = useRef<HTMLAudioElement | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);

    const editingImagePath = selectedImagePath ?? null;

    const resetState = useCallback(() => {
        setGerman("");
        setSwahili("");
        setImageFile(null);
        setPreviewUrl(null);
        setStatus(null);
        setLoading(false);
        setEditAudioPath(null);
        setSelectedImagePath(null);
        setSuggestOpen(false);
        setSuggestLoading(false);
        setSuggestItems([]);
        setSuggestError(null);
        setSuggestedImagePath(null);
        setIsRecording(false);
    }, []);

    useEffect(() => {
        if (!open) {
            resetState();
        }
    }, [open, resetState]);

    useEffect(() => {
        if (!imageFile) {
            return;
        }
        const url = URL.createObjectURL(imageFile);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [imageFile]);

    const loadCard = useCallback(async () => {
        if (!open || !cardId) return;

        setLoading(true);
        setStatus(null);

        try {
            const res = await fetch(
                `/api/cards?id=${encodeURIComponent(cardId)}`,
                { cache: "no-store" }
            );
            const json = await res.json();
            if (!res.ok) {
                setStatus(json.error ?? "Karte konnte nicht geladen werden.");
                return;
            }

            const card: CardEditorCard | undefined =
                json.card ?? (Array.isArray(json.cards) ? json.cards[0] : undefined);

            if (!card) {
                setStatus("Karte nicht gefunden.");
                return;
            }

            setGerman(card.german_text ?? "");
            setSwahili(card.swahili_text ?? "");
            setEditAudioPath(card.audio_path ?? null);
            setSelectedImagePath(card.image_path ?? null);
            setSuggestedImagePath(null);
            setImageFile(null);

            if (card.image_path) {
                setPreviewUrl(`${IMAGE_BASE_URL}/${card.image_path}`);
            } else {
                setPreviewUrl(null);
            }
        } finally {
            setLoading(false);
        }
    }, [cardId, open, ownerKey]);

    useEffect(() => {
        if (!open) return;

        if (initialCard && String(initialCard.id) === String(cardId)) {
            setGerman(initialCard.german_text ?? "");
            setSwahili(initialCard.swahili_text ?? "");
            setEditAudioPath(initialCard.audio_path ?? null);
            setSelectedImagePath(initialCard.image_path ?? null);
            setSuggestedImagePath(null);
            setImageFile(null);

            if (initialCard.image_path) {
                setPreviewUrl(`${IMAGE_BASE_URL}/${initialCard.image_path}`);
            } else {
                setPreviewUrl(null);
            }
        }

        void loadCard();
    }, [cardId, initialCard, loadCard, open]);

    function stopAnyAudio() {
        if (audioElRef.current) {
            audioElRef.current.pause();
            audioElRef.current.currentTime = 0;
        }
    }

    function playCardAudioIfExists(path: string | null) {
        if (!path) return;
        const url = `${AUDIO_BASE_URL}/${path}`;
        stopAnyAudio();
        audioElRef.current = new Audio(url);
        audioElRef.current.play().catch(() => { });
    }

    async function uploadImage(): Promise<string | null> {
        if (!imageFile) return null;

        const formData = new FormData();
        formData.append("file", imageFile);

        const res = await fetch("/api/upload-image", {
            method: "POST",
            body: formData,
        });

        const json = await res.json();
        if (!res.ok) {
            throw new Error(json.error ?? "Upload failed");
        }

        return json.path as string;
    }

    async function openImageSuggestions() {
        setSuggestError(null);
        setSuggestItems([]);
        setSuggestLoading(true);
        setSuggestOpen(true);

        const trimmedGerman = german.trim();
        const trimmedSwahili = swahili.trim();
        const query = trimmedGerman || trimmedSwahili;
        if (!query) {
            setSuggestLoading(false);
            setSuggestError("Bitte zuerst Deutsch oder Swahili ausfüllen.");
            return;
        }

        const params = new URLSearchParams();
        if (trimmedGerman) params.set("german", trimmedGerman);
        if (trimmedSwahili) params.set("swahili", trimmedSwahili);
        params.set("q", query);

        const res = await fetch(`/api/images/suggest?${params.toString()}`);
        const json = await res.json();

        setSuggestLoading(false);

        if (!res.ok) {
            setSuggestError(json.error ?? "Bildvorschläge konnten nicht geladen werden.");
            return;
        }

        setSuggestItems(json.items ?? []);
    }

    async function chooseSuggestedImage(imageUrl: string, thumbUrl?: string) {
        try {
            setStatus("Übernehme Bild...");
            setSuggestError(null);

            const res = await fetch("/api/images/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageUrl }),
            });
            const json = await res.json();

            if (!res.ok) {
                setStatus(null);
                setSuggestError(json.error ?? "Bild konnte nicht übernommen werden.");
                return;
            }

            setSelectedImagePath(json.path);
            setSuggestedImagePath(json.path);

            if (thumbUrl) setPreviewUrl(thumbUrl);
            setImageFile(null);

            setStatus("Bild übernommen ✅");
            setSuggestOpen(false);
        } catch (e) {
            console.error(e);
            setStatus("Bildübernahme fehlgeschlagen.");
        } finally {
            setSuggestLoading(false);
        }
    }

    async function startRecordingForEdit() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const candidates = [
            "audio/mp4",
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/ogg",
        ];
        const mimeType =
            candidates.find((t) => (window as any).MediaRecorder?.isTypeSupported?.(t)) ?? "";

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());

            const rawType = recorder.mimeType || "audio/mp4";
            const baseType = rawType.split(";")[0];
            const blob = new Blob(chunksRef.current, { type: baseType });

            const resolvedCardId = String(cardId ?? "").trim();
            if (!resolvedCardId) {
                console.error("No editingId for audio upload");
                return;
            }

            const fd = new FormData();
            fd.append("file", new File([blob], "recording", { type: blob.type }));
            fd.append("cardId", resolvedCardId);

            const res = await fetch("/api/upload-audio", { method: "POST", body: fd });
            const json = await res.json();

            if (!res.ok) {
                console.error(json?.error || "Upload failed");
                setStatus(json?.error || "Upload fehlgeschlagen");
                return;
            }

            const newPath = json.audio_path ?? null;

            setEditAudioPath(newPath);
            setStatus("Audio gespeichert ✅");
        };

        recorder.start();
        setIsRecording(true);
    }

    function stopRecordingForEdit() {
        const r = mediaRecorderRef.current;
        if (!r) return;
        r.stop();
        setIsRecording(false);
    }

    async function saveCard() {
        if (!cardId) return;

        try {
            setStatus("Speichere...");

            let imagePath: string | null | undefined = undefined;

            if (suggestedImagePath) {
                imagePath = suggestedImagePath;
            } else if (imageFile) {
                imagePath = (await uploadImage()) ?? null;
            }

            const body: any = {
                id: cardId,
                german,
                swahili,
            };

            if (imagePath !== undefined) body.imagePath = imagePath;

            const res = await fetch("/api/cards", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const json = await res.json();

            if (!res.ok) {
                if (res.status === 409) {
                    setStatus(json.error ?? "Diese Karte existiert bereits.");
                    return;
                }
                setStatus(json.error ?? "Aktualisieren fehlgeschlagen.");
                return;
            }

            const updated = json.card as CardEditorCard;
            setStatus("Karte aktualisiert ✅");

            onSaved?.(updated);
            onClose();
        } catch (e: any) {
            setStatus(e?.message ?? "Aktualisieren fehlgeschlagen.");
        }
    }

    async function deleteCard() {
        if (!cardId) return;
        const yes = confirm("Karte wirklich löschen?");
        if (!yes) return;

        const res = await fetch(
            `/api/cards?id=${encodeURIComponent(cardId)}`,
            { method: "DELETE" }
        );
        const json = await res.json();

        if (!res.ok) {
            setStatus(json?.error || "Löschen fehlgeschlagen.");
            return;
        }

        onDeleted?.(cardId);
        onClose();
    }

    return (
        <>
            <FullScreenSheet open={open} title="Karte bearbeiten" onClose={onClose}>
                {loading ? (
                    <div className="rounded-2xl border border-soft p-6 shadow-soft bg-surface text-sm text-muted">
                        Lade Karte...
                    </div>
                ) : (
                    <div className="rounded-2xl border border-soft p-6 shadow-soft bg-surface">
                        {/* Enable multi-line entry for sentences/paragraphs. */}
                        <label className="block text-sm font-medium">Deutsch</label>
                        <textarea
                            className="mt-1 w-full rounded-xl border p-3 whitespace-pre-wrap"
                            value={german}
                            onChange={(e) => setGerman(e.target.value)}
                            placeholder="z.B. Guten Morgen"
                            rows={3}
                        />

                        {/* Enable multi-line entry for sentences/paragraphs. */}
                        <label className="block text-sm font-medium mt-4">Swahili</label>
                        <textarea
                            className="mt-1 w-full rounded-xl border p-3 whitespace-pre-wrap"
                            value={swahili}
                            onChange={(e) => setSwahili(e.target.value)}
                            placeholder="z.B. Habari za asubuhi"
                            rows={3}
                        />

                        <div className="mt-6 text-sm font-medium">Medien</div>

                        <input
                            type="file"
                            accept="image/*"
                            id="image-upload"
                            className="hidden"
                            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                        />

                        <div className="mt-2 rounded-xl border p-2">
                            <div className="text-sm font-medium">Aussprache</div>

                            <div className="mt-4 flex items-center gap-3">
                                {editAudioPath ? (
                                    <>
                                        <button
                                            type="button"
                                            className="rounded-xl border px-3 py-2"
                                            onClick={() => playCardAudioIfExists(editAudioPath)}
                                        >
                                            🔊 Abspielen
                                        </button>

                                        {!isRecording ? (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={startRecordingForEdit}
                                            >
                                                🎙️ Neu aufnehmen
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={stopRecordingForEdit}
                                            >
                                                ⏹️ Stop & Speichern
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {!isRecording ? (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={startRecordingForEdit}
                                            >
                                                🎙️ Aufnahme starten
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={stopRecordingForEdit}
                                            >
                                                ⏹️ Stop & Speichern
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="mt-2 text-xs text-muted">
                                Audio kann nur bei bestehenden Karten gespeichert werden.
                            </div>
                        </div>

                        <div className="mt-4 text-sm font-medium">Bild</div>

                        <label
                            htmlFor="image-upload"
                            className="
                                mt-2 flex items-center justify-center gap-3
                                rounded-2xl border-2 border-dashed
                                p-4 cursor-pointer
                                transition
                                hover:bg-surface hover:border-accent
                            "
                        >
                            {previewUrl ? (
                                <>
                                    <img
                                        src={previewUrl}
                                        alt="Vorschau"
                                        className="w-16 h-16 object-cover rounded-xl border"
                                    />
                                    <div className="text-sm">
                                        <div className="font-medium">Bild ändern</div>
                                        <div className="text-xs text-muted">
                                            Tippen zum Austauschen
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-3xl">🖼️</div>
                                    <div className="text-sm">
                                        <div className="font-medium">Bild hinzufügen</div>
                                        <div className="text-xs text-muted">
                                            Tippen, um ein Bild auszuwählen
                                        </div>
                                    </div>
                                </>
                            )}
                        </label>

                        <button
                            type="button"
                            className="mt-6 w-full rounded-xl border p-3"
                            onClick={openImageSuggestions}
                        >
                            ✨ Bild vorschlagen
                        </button>

                        {suggestedImagePath ? (
                            <div className="mt-2 text-xs text-muted">
                                Vorschlagsbild ausgewählt ✅
                            </div>
                        ) : null}

                        {editingImagePath ? (
                            <div className="mt-3">
                                <div className="text-xs text-muted mb-2">Aktuelles Bild</div>
                                <img
                                    src={`${IMAGE_BASE_URL}/${editingImagePath}`}
                                    alt="Aktuelles Bild"
                                    className="w-full max-h-56 object-contain rounded-2xl border border-soft bg-surface"
                                />
                            </div>
                        ) : null}

                        <div className="mt-6 grid grid-cols-2 gap-4">
                            <button
                                className="rounded-xl bg-accent-primary text-on-accent p-3 disabled:opacity-60"
                                onClick={saveCard}
                                disabled={!german || !swahili}
                                type="button"
                            >
                                Speichern
                            </button>

                            <button
                                className="rounded-xl border p-3"
                                type="button"
                                onClick={onClose}
                            >
                                Abbrechen
                            </button>
                        </div>

                        <button
                            type="button"
                            className="mt-3 w-full rounded-xl border p-3 text-accent-cta"
                            onClick={deleteCard}
                        >
                            🗑️ Löschen
                        </button>
                    </div>
                )}

                {status ? (
                    <div className="mt-4 rounded-xl border border-soft bg-surface p-3 text-sm">
                        {status}
                    </div>
                ) : null}
            </FullScreenSheet>

            <FullScreenSheet
                open={suggestOpen}
                title="Bildvorschläge"
                onClose={() => setSuggestOpen(false)}
            >
                {suggestLoading ? (
                    <div className="mt-4 text-sm text-muted">Lade Vorschläge…</div>
                ) : suggestError ? (
                    <div className="mt-4 rounded-xl border border-cta bg-accent-cta-soft p-3 text-sm text-accent-cta">
                        {suggestError}
                    </div>
                ) : suggestItems.length === 0 ? (
                    <div className="mt-4 text-sm text-muted">
                        Keine Treffer. Versuch ein anderes Wort (z.B. Singular) oder Swahili/Deutsch tauschen.
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-2 gap-4">
                        {suggestItems.map((it) => (
                            <button
                                key={it.pageId}
                                type="button"
                                className="rounded-xl border overflow-hidden hover:shadow-soft transition"
                                onClick={() => chooseSuggestedImage(it.importUrl, it.thumb)}
                            >
                                <img src={it.thumb} alt={it.title} className="w-full h-28 object-cover" />
                                <div className="p-2 text-xs text-muted line-clamp-2">{it.title}</div>
                            </button>
                        ))}
                    </div>
                )}
            </FullScreenSheet>
        </>
    );
}
