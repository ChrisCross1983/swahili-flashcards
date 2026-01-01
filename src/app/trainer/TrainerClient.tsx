"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { initFeedbackSounds, playCorrect, playWrong } from "@/lib/audio/sounds";
import FullScreenSheet from "@/components/FullScreenSheet";

const LEGACY_KEY_NAME = "ramona_owner_key";

type Props = {
    ownerKey: string;
};

const IMAGE_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-images`;

function shuffleArray<T>(array: T[]): T[] {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export default function TrainerClient({ ownerKey }: Props) {
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [german, setGerman] = useState("");
    const [swahili, setSwahili] = useState("");
    const [status, setStatus] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [cards, setCards] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [openSearch, setOpenSearch] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [todayItems, setTodayItems] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [reveal, setReveal] = useState(false);
    const [direction, setDirection] = useState<"DE_TO_SW" | "SW_TO_DE">("DE_TO_SW");
    const [wrongCounts, setWrongCounts] = useState<Record<string, number>>({});
    const [duplicateHint, setDuplicateHint] = useState<string | null>(null);
    const [duplicatePreview, setDuplicatePreview] = useState<any | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editSource, setEditSource] = useState<"cards" | "create">("create");
    const [openLearn, setOpenLearn] = useState(false);
    const [openCards, setOpenCards] = useState(false);
    const [openCreate, setOpenCreate] = useState(false);
    const [learnMode, setLearnMode] = useState<"LEITNER_TODAY" | "ALL_SHUFFLE" | null>(null);
    const [learnStarted, setLearnStarted] = useState(false);
    const [returnToLearn, setReturnToLearn] = useState(false);
    const [directionMode, setDirectionMode] = useState<"DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null>(null);
    const [openDirectionChange, setOpenDirectionChange] = useState(false);
    const [learnDone, setLearnDone] = useState(false);
    const [sessionCorrect, setSessionCorrect] = useState(0);
    const [sessionTotal, setSessionTotal] = useState(0);
    const [showSummary, setShowSummary] = useState(false);
    const [legacyKey, setLegacyKey] = useState<string | null>(null);
    const [showMigrate, setShowMigrate] = useState(false);
    const [startHint, setStartHint] = useState<string | null>(null);
    const [migrateStatus, setMigrateStatus] = useState<string | null>(null);
    const [suggestOpen, setSuggestOpen] = useState(false);
    const [suggestLoading, setSuggestLoading] = useState(false);
    const [selectedSuggestUrl, setSelectedSuggestUrl] = useState<string | null>(null);
    const [selectedSuggestPath, setSelectedSuggestPath] = useState<string | null>(null);
    const [suggestItems, setSuggestItems] = useState<any[]>([]);
    const [suggestError, setSuggestError] = useState<string | null>(null);
    const [suggestedImagePath, setSuggestedImagePath] = useState<string | null>(null);
    const [editAudioPath, setEditAudioPath] = useState<string | null>(null);
    const [pendingAudioBlob, setPendingAudioBlob] = useState<Blob | null>(null);
    const [pendingAudioType, setPendingAudioType] = useState<string | null>(null);

    const router = useRouter();

    const editingCard = cards.find((c) => c.id === editingId) ?? null;

    const editingImagePath =
        selectedSuggestPath ?? (editingCard?.image_path ?? null);

    const [leitnerStats, setLeitnerStats] = useState<null | {
        total: number;
        byLevel: { level: number; label: string; count: number }[];
        nextDueDate: string | null;
        nextDueInDays: number | null;
    }>(null);

    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const audioElRef = useRef<HTMLAudioElement | null>(null);

    function getAudioPublicUrl(path: string) {
        return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-audio/${path}`;
    }

    function stopAnyAudio() {
        if (audioElRef.current) {
            audioElRef.current.pause();
            audioElRef.current.currentTime = 0;
        }
    }

    function playCardAudioIfExists(card: any) {
        if (!card?.audio_path) return;
        const url = getAudioPublicUrl(card.audio_path);
        stopAnyAudio();
        audioElRef.current = new Audio(url);
        audioElRef.current.play().catch(() => { });
    }

    useEffect(() => {
        const k = localStorage.getItem(LEGACY_KEY_NAME);
        if (k && k !== ownerKey) {
            setLegacyKey(k);
            setShowMigrate(true);
        }
    }, [ownerKey]);

    useEffect(() => {
        initFeedbackSounds();
    }, []);

    useEffect(() => {
        (async () => {
            const supabase = supabaseBrowser();
            const { data } = await supabase.auth.getUser();
            setUserEmail(data.user?.email ?? null);
        })();
    }, []);

    useEffect(() => {
        if (!imageFile) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(imageFile);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [imageFile]);

    useEffect(() => {
        loadCards(undefined, { silent: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

        const query = german.trim() || swahili.trim();
        if (!query) {
            setSuggestLoading(false);
            setSuggestError("Bitte zuerst Deutsch oder Swahili ausfüllen.");
            return;
        }

        const res = await fetch(`/api/images/suggest?q=${encodeURIComponent(query)}`);
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
                body: JSON.stringify({ ownerKey, imageUrl }),
            });
            const json = await res.json();

            if (!res.ok) {
                setStatus("");
                setSuggestError(json.error ?? "Bild konnte nicht übernommen werden.");
                return;
            }

            setSelectedSuggestUrl(imageUrl);
            setSelectedSuggestPath(json.path);

            setSuggestedImagePath(json.path);

            // Preview zeigen (optional: thumb, sonst Storage-URL)
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

    async function startRecording() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const candidates = [
            "audio/mp4",
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/ogg",
        ];
        const mimeType = candidates.find((t) => (window as any).MediaRecorder?.isTypeSupported?.(t)) ?? "";

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

            const card = todayItems[currentIndex];
            if (!card) return;

            const resolvedCardId = String(card.cardId ?? card.id ?? "").trim();
            if (!resolvedCardId) {
                console.error("No card id found in current item", card);
                return;
            }

            const fd = new FormData();
            fd.append("file", new File([blob], "recording", { type: blob.type }));
            fd.append("cardId", resolvedCardId);
            fd.append("ownerKey", ownerKey);

            const res = await fetch("/api/upload-audio", { method: "POST", body: fd });
            const json = await res.json();

            if (!res.ok) {
                console.error(json?.error || "Upload failed");
                return;
            }

            const updated = { ...card, audio_path: json.audio_path };
            const copy = [...todayItems];
            copy[currentIndex] = updated;
            setTodayItems(copy);
            setStatus("Audio gespeichert ✅");
        };

        recorder.start();
        setIsRecording(true);
    }

    function stopRecording() {
        const r = mediaRecorderRef.current;
        if (!r) return;
        r.stop();
        setIsRecording(false);
    }

    async function startRecordingForCreate() {
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

        recorder.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());

            const rawType = recorder.mimeType || "audio/mp4";
            const baseType = rawType.split(";")[0];

            const blob = new Blob(chunksRef.current, { type: baseType });

            setPendingAudioBlob(blob);
            setPendingAudioType(baseType);
            setStatus("Audio bereit ✅ (wird beim Speichern hochgeladen)");
        };

        recorder.start();
        setIsRecording(true);
    }

    function stopRecordingForCreate() {
        const r = mediaRecorderRef.current;
        if (!r) return;
        r.stop();
        setIsRecording(false);
    }

    async function createCard(skipWarning = false) {
        try {

            // Warnung nur beim ersten Versuch
            if (!skipWarning) {
                const exists = await checkExistingGerman();
                if (exists) {
                    setStatus(""); // Status leeren, Warnbox übernimmt
                    return;
                }
            }

            setStatus("Speichere...");

            const imagePath = suggestedImagePath ?? (await uploadImage());

            const res = await fetch("/api/cards", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ownerKey,
                    german,
                    swahili,
                    imagePath,
                }),
            });

            const json = await res.json();

            if (!res.ok) {
                console.error(json.error);

                if (res.status === 409) {
                    setDuplicateHint(json.error ?? "Diese Karte existiert bereits.");
                    setStatus("");
                    return;
                }

                setStatus(json.error ?? "Speichern fehlgeschlagen");
                return;
            }

            const created = json.card;

            if (created?.id && pendingAudioBlob) {
                const fd = new FormData();
                fd.append(
                    "file",
                    new File([pendingAudioBlob], "recording", { type: pendingAudioType ?? "audio/mp4" })
                );
                fd.append("cardId", String(created.id));
                fd.append("ownerKey", ownerKey);

                const up = await fetch("/api/upload-audio", { method: "POST", body: fd });
                const upJson = await up.json();

                if (up.ok) {
                    setPendingAudioBlob(null);
                    setPendingAudioType(null);
                } else {
                    setStatus(upJson?.error ?? "Audio-Upload fehlgeschlagen");
                }
            }

            showToast("Karte gespeichert ✅");
            setSelectedSuggestUrl(null);
            setSelectedSuggestPath(null);
            setSuggestItems([]);
            setStatus("Karte gespeichert ✅");
            setImageFile(null);
            setSuggestedImagePath(null);
            setDuplicateHint(null);
            setDuplicatePreview(null);
            await loadCards(undefined, { silent: true });
            // Create-Flow: Formular für nächste Karte vorbereiten
            setGerman("");
            setSwahili("");
            resetImageInputs();

            setPendingAudioBlob(null);
            setPendingAudioType(null);

            setEditAudioPath(null);
            setEditingId(null);

            setDuplicateHint(null);
            setDuplicatePreview(null);

            setStatus("Karte gespeichert ✅");

        } catch (e: any) {
            setStatus(`Fehler: ${e.message}`);
        }
    }

    async function updateCard() {
        try {
            setDuplicateHint(null);
            setStatus("Speichere...");

            if (!editingId) {
                setStatus("Fehler: Keine Karte zum Speichern ausgewählt.");
                return;
            }

            let imagePath: string | null | undefined = undefined;

            if (suggestedImagePath) {
                imagePath = suggestedImagePath;
            }
            else if (imageFile) {
                imagePath = (await uploadImage()) ?? null;
            }

            const body: any = {
                ownerKey,
                id: editingId,
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
                    setDuplicateHint(json.error ?? "Diese Karte existiert bereits.");
                    setStatus("");
                    return;
                }
                setStatus(json.error ?? "Aktualisieren fehlgeschlagen.");
                return;
            }

            const updated = json.card; // { id, german_text, swahili_text, image_path, ... }

            showToast("Karte aktualisiert ✅");

            setCards((prev) =>
                prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
            );

            setTodayItems((prev) =>
                prev.map((it: any) => {
                    const itId = it.cardId ?? it.card_id ?? it.id;
                    if (String(itId) !== String(updated.id)) return it;

                    return {
                        ...it,
                        german: updated.german_text,
                        swahili: updated.swahili_text,
                        imagePath: updated.image_path ?? null,
                        image_path: updated.image_path ?? null,
                        german_text: updated.german_text,
                        swahili_text: updated.swahili_text,
                    };
                })
            );

            // ✅ Edit-Inputs resetten
            setGerman("");
            setSwahili("");
            setImageFile(null);
            setSuggestedImagePath(null);
            setSelectedSuggestUrl(null);
            setSelectedSuggestPath(null);
            setSuggestItems([]);
            setSuggestError(null);

            if (returnToLearn) {
                setReturnToLearn(false);
                setStatus("");
                return;
            }

            if (editSource === "create") {
                setOpenCards(false);
                setOpenCreate(true);

                // zurück in "Neue Karte"-Modus
                setEditingId(null);
                setEditAudioPath(null);

                setGerman("");
                setSwahili("");
                resetImageInputs();

                setDuplicateHint(null);
                setDuplicatePreview(null);

                setPendingAudioBlob(null);
                setPendingAudioType(null);

                setStatus("Duplikat aktualisiert ✅");
                return;
            }

            // Standard-Fall: Edit aus "Meine Karten"
            setOpenCreate(false);
            setOpenCards(true);

        } catch (e: any) {
            setStatus(e?.message ?? "Aktualisieren fehlgeschlagen.");
        }
    }

    function saveCard() {
        if (editingId) {
            return updateCard();
        }
        return createCard();
    }

    async function loadCards(q?: string, opts?: { silent?: boolean }) {
        const silent = opts?.silent ?? false;

        if (!silent) setStatus("Lade Karten...");

        const url =
            q && q.trim().length > 0
                ? `/api/cards?ownerKey=${encodeURIComponent(ownerKey)}&q=${encodeURIComponent(q)}`
                : `/api/cards?ownerKey=${encodeURIComponent(ownerKey)}`;

        const res = await fetch(url);
        const json = await res.json();

        if (!res.ok) {
            if (!silent) setStatus(json.error ?? "Aktion fehlgeschlagen.");
            return;
        }

        setCards(json.cards);

        if (!silent) setStatus("");
    }

    function startEdit(card: any, source: "cards" | "create" = "cards") {
        setEditSource(source);

        setEditingId(card.id);
        setGerman(card.german_text ?? "");
        setSwahili(card.swahili_text ?? "");
        setDuplicateHint(null);
        setImageFile(null);
        setEditAudioPath(card.audio_path ?? null);
        setStatus("");

        const existingPath = card.image_path ?? null;

        setSelectedSuggestPath(existingPath);
        setSelectedSuggestUrl(null);

        if (existingPath) {
            setPreviewUrl(`${IMAGE_BASE_URL}/${existingPath}`);
        } else {
            setPreviewUrl(null);
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

            const resolvedCardId = String(editingId ?? "").trim();
            if (!resolvedCardId) {
                console.error("No editingId for audio upload");
                return;
            }

            const fd = new FormData();
            fd.append("file", new File([blob], "recording", { type: blob.type }));
            fd.append("cardId", resolvedCardId);
            fd.append("ownerKey", ownerKey);

            const res = await fetch("/api/upload-audio", { method: "POST", body: fd });
            const json = await res.json();

            if (!res.ok) {
                console.error(json?.error || "Upload failed");
                setStatus(json?.error || "Upload fehlgeschlagen");
                return;
            }

            setEditAudioPath(json.audio_path ?? null);
            setStatus("Audio gespeichert ✅");

            await loadCards();
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

    function cancelEdit() {
        setEditingId(null);
        setGerman("");
        setSwahili("");
        setImageFile(null);
        setDuplicateHint(null);
        setEditAudioPath(null);
        setStatus("");
    }

    async function checkExistingGerman(): Promise<boolean> {
        const res = await fetch("/api/cards/check-existing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ownerKey,
                german,
            }),
        });

        const json = await res.json();

        if (!res.ok) {
            console.error(json.error);
            return false;
        }

        if (json.exists) {
            setDuplicateHint(
                `Hinweis: Für „${german}“ gibt es bereits Karten. Prüfe kurz, ob es eine Variante oder ein Tippfehler ist.`
            );

            setDuplicatePreview(json.cards ?? null);

            return true;
        }

        return false;
    }

    async function deleteCard(id: string) {
        const yes = confirm("Karte wirklich löschen?");
        if (!yes) return;

        setStatus("Lösche...");
        const res = await fetch(
            `/api/cards?ownerKey=${encodeURIComponent(ownerKey)}&id=${encodeURIComponent(id)}`,
            { method: "DELETE" }
        );

        const json = await res.json();
        if (!res.ok) {
            setStatus(json.error ?? "Aktion fehlgeschlagen.");
            return;
        }

        showToast("Karte gelöscht ✅");
        await loadCards(undefined, { silent: true });
    }

    function startEditFromLearn() {
        const item = todayItems[currentIndex];
        if (!item) return;

        setReturnToLearn(true);

        setEditingId(item.cardId);
        setGerman(currentGerman ?? "");
        setSwahili(currentSwahili ?? "");
        setEditAudioPath(item.audio_path ?? null);
        setDuplicateHint(null);
        setDuplicatePreview(null);

        const existingPath =
            item?.image_path ?? item?.imagePath ?? item?.image ?? null;

        if (existingPath) {
            setPreviewUrl(`${IMAGE_BASE_URL}/${existingPath}`);
        } else {
            setPreviewUrl(null);
        }

        setSuggestedImagePath(null);
        setSelectedSuggestUrl(null);
        setSelectedSuggestPath(existingPath);

        setOpenCreate(true);
    }

    async function loadToday() {
        setStatus("Lade fällige Karten...");

        const res = await fetch(
            `/api/learn/today?ownerKey=${encodeURIComponent(ownerKey)}`, { cache: "no-store" }
        );
        const json = await res.json();

        if (!res.ok) {
            setStatus(json.error ?? "Aktion fehlgeschlagen.");
            return;
        }

        const items = Array.isArray(json.items) ? json.items : [];

        setSessionTotal(items.length);

        setTodayItems(shuffleArray(items));
        setSessionTotal(json.items.length);
        setSessionCorrect(0);
        setCurrentIndex(0);
        setReveal(false);

        setStatus(`Fällig heute: ${items.length}`);
    }

    async function loadAllForDrill() {
        setStatus("Lade alle Karten...");

        const res = await fetch(
            `/api/cards/all?ownerKey=${encodeURIComponent(ownerKey)}`, { cache: "no-store" }
        );

        const json = await res.json();

        if (!res.ok) {
            setStatus(json.error ?? "Aktion fehlgeschlagen.");
            return;
        }

        const items = (json.cards ?? []).map((c: any) => ({
            cardId: c.id,
            level: 0,
            dueDate: null,
            german: c.german_text,
            swahili: c.swahili_text,
            imagePath: c.image_path ?? null,
            audio_path: c.audio_path ?? null,
        }));

        setSessionTotal(items.length);

        setTodayItems(shuffleArray(items));
        setCurrentIndex(0);
        setReveal(false);

        setStatus(`Alle Karten: ${items.length}`);
    }

    async function loadLeitnerStats() {
        const res = await fetch(`/api/learn/stats?ownerKey=${encodeURIComponent(ownerKey)}`);
        const json = await res.json();
        if (!res.ok) return;

        setLeitnerStats(json);
    }

    function revealCard() {
        setReveal(true);

        const card = todayItems[currentIndex];
        playCardAudioIfExists(card);
    }

    async function gradeCurrent(correct: boolean) {
        const item = todayItems[currentIndex];
        if (!item) return;

        if (correct) playCorrect();
        else playWrong();

        // Session-Statistik
        if (correct) setSessionCorrect((x) => x + 1);

        const nextIndex = currentIndex + 1;

        // === DRILL MODUS: NUR EINMAL DURCHLAUFEN (KEINE DB-ÄNDERUNG, KEIN WIEDERHOLEN) ===
        if (learnMode === "ALL_SHUFFLE") {
            if (nextIndex >= todayItems.length) {
                // Session beendet → Summary anzeigen
                setReveal(false);
                setTodayItems([]);
                setShowSummary(true);
                return;
            }

            setCurrentIndex(nextIndex);
            setReveal(false);

            // Richtung ggf. neu würfeln
            if (directionMode === "RANDOM") {
                setDirection(Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE");
            }
            return;
        }

        // === LEITNER MODUS: DB UPDATE ===
        try {
            await fetch("/api/learn/grade", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ownerKey,
                    cardId: item.cardId,
                    correct,
                }),
            });
        } catch (e) {
            console.error(e);
        }

        if (nextIndex >= todayItems.length) {
            setReveal(false);
            setTodayItems([]);      // triggert "Erledigt"-UI
            setLearnDone(true);     // zeigt "Heute erledigt"
            return;
        }

        // nächste Karte
        setCurrentIndex(nextIndex);
        setReveal(false);

        if (directionMode === "RANDOM") {
            setDirection(Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE");
        }
    }

    async function logout() {
        const supabase = supabaseBrowser();
        await supabase.auth.signOut();
        window.location.href = "/login";
    }

    function showToast(message: string) {
        setStatus(message);
        window.setTimeout(() => setStatus(""), 2500);
    }

    function resetImageInputs() {
        setImageFile(null);
        setPreviewUrl(null);

        setSuggestOpen(false);
        setSuggestLoading(false);
        setSuggestItems([]);
        setSuggestError(null);

        setSelectedSuggestUrl(null);
        setSelectedSuggestPath(null);

        setSuggestedImagePath(null);
    }

    async function migrateLegacyData() {
        if (!legacyKey) return;

        setMigrateStatus("Übernehme alte Karten…");

        const res = await fetch("/api/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fromKey: legacyKey, toKey: ownerKey }),
        });

        const json = await res.json();

        if (!res.ok) {
            setMigrateStatus(json.error ?? "Migration fehlgeschlagen.");
            return;
        }

        setMigrateStatus("Fertig ✅ Alte Karten wurden übernommen.");

        localStorage.removeItem(LEGACY_KEY_NAME);

        // neu laden
        await loadCards();
        setShowMigrate(false);
    }

    const filteredCards = cards.filter((c) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
            (c.german_text ?? "").toLowerCase().includes(q) ||
            (c.swahili_text ?? "").toLowerCase().includes(q)
        );
    });

    const currentItem = todayItems[currentIndex] ?? null;

    const currentGerman =
        currentItem?.german_text ?? currentItem?.german ?? currentItem?.de ?? "";

    const currentSwahili =
        currentItem?.swahili_text ?? currentItem?.swahili ?? currentItem?.sw ?? "";

    const currentImagePath =
        currentItem?.image_path ?? currentItem?.imagePath ?? currentItem?.image ?? null;

    return (
        <main className="min-h-screen p-6 flex justify-center">
            <div className="w-full max-w-xl">
                <h1 className="text-2xl font-semibold">Swahili Flashcards (MVP)</h1>

                <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                        className="rounded-xl border px-3 py-2 text-sm"
                        onClick={() => router.push("/")}
                    >
                        ← Home
                    </button>

                    <div className="text-xs text-gray-500">
                        Eingeloggt als: <span className="font-mono">{userEmail ?? "..."}</span>
                    </div>

                    <button className="rounded-xl border px-3 py-2 text-sm" onClick={logout}>
                        Logout
                    </button>
                </div>

                {showMigrate ? (
                    <div className="mt-4 rounded-2xl border p-4 bg-white">
                        <div className="font-semibold">Alte Karten gefunden</div>
                        <div className="mt-1 text-sm text-gray-600">
                            Deine Karten aus der alten App-Version sind noch da, aber unter einem anderen Schlüssel gespeichert.
                            Mit einem Klick übernehmen wir sie in deinen Login.
                        </div>

                        {migrateStatus ? (
                            <div className="mt-2 text-sm text-gray-600">{migrateStatus}</div>
                        ) : null}

                        <div className="mt-3 flex gap-3">
                            <button
                                className="rounded-xl bg-black text-white px-4 py-2 text-sm"
                                type="button"
                                onClick={migrateLegacyData}
                            >
                                Jetzt übernehmen
                            </button>

                            <button
                                className="rounded-xl border px-4 py-2 text-sm"
                                type="button"
                                onClick={() => setShowMigrate(false)}
                            >
                                Später
                            </button>
                        </div>
                    </div>
                ) : null}

                {/* Bubbles */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <button
                        onClick={() => {
                            setOpenLearn(true);

                            // Setup sauber zurücksetzen
                            setLearnStarted(false);
                            setLearnDone(false);
                            setShowSummary(false);

                            // NICHTS vorauswählen (UX!)
                            setLearnMode(null);
                            setDirectionMode(null);

                            // Session reset
                            setTodayItems([]);
                            setCurrentIndex(0);
                            setReveal(false);

                            setStatus("");
                        }}
                        className="rounded-[32px] border p-8 text-left shadow-sm hover:shadow transition"
                    >
                        <div className="text-xl font-semibold">Vokabeln lernen</div>
                        <div className="mt-2 text-sm text-gray-600">
                            Starte deine fälligen Karten im Fokus-Modus.
                        </div>
                    </button>

                    <button
                        onClick={() => {
                            setStatus("");
                            setDuplicateHint(null);
                            resetImageInputs();

                            setEditSource("create");
                            setEditAudioPath(null);
                            setEditingId(null);

                            setPendingAudioBlob(null);
                            setPendingAudioType(null);

                            setOpenCreate(true);
                        }}
                        className="rounded-[32px] border p-8 text-left shadow-sm hover:shadow transition"
                    >
                        <div className="text-xl font-semibold">Neue Wörter anlegen</div>
                        <div className="mt-2 text-sm text-gray-600">
                            Neue Karte anlegen (Deutsch ↔ Swahili).
                        </div>
                    </button>
                    <button
                        onClick={() => {
                            setStatus("");
                            setDuplicateHint(null);
                            setDuplicatePreview(null);
                            setOpenCards(true);
                            loadCards();
                        }}
                        className="rounded-[32px] border p-8 text-left shadow-sm hover:shadow transition"
                    >
                        <div className="text-xl font-semibold">Meine Karten</div>
                        <div className="mt-2 text-sm text-gray-600">
                            Durchsuchen, bearbeiten und aufräumen.
                        </div>
                    </button>
                    <button
                        className="rounded-[32px] border p-8 text-left shadow-sm hover:shadow transition"
                        onClick={() => {
                            setOpenSearch(true);
                            loadCards(undefined, { silent: true });
                        }}
                    >
                        <div className="text-xl font-semibold">Karte suchen</div>
                        <div className="mt-2 text-sm text-gray-600">
                            Deutsch oder Swahili.
                        </div>
                    </button>
                </div>

                {/* Learn Modal */}
                <FullScreenSheet
                    open={openLearn}
                    title="Vokabeln lernen"
                    onClose={() => {
                        if (learnStarted || showSummary || todayItems.length > 0 || learnDone) {
                            setLearnStarted(false);
                            setLearnDone(false);
                            setShowSummary(false);
                            setTodayItems([]);
                            setCurrentIndex(0);
                            setReveal(false);
                            setStatus("");

                            setLearnMode(null);
                            setDirectionMode(null);

                            return;
                        }

                        setOpenLearn(false);
                    }}
                >
                    {/* === SETUP === */}
                    {!learnStarted && (
                        <div className="mt-4 rounded-2xl border p-4 bg-white">
                            <div className="text-sm font-medium">Einstellungen</div>
                            <p className="mt-1 text-sm text-gray-600">
                                Wähle Lernmodus und Abfragerichtung – dann starten wir.
                            </p>

                            <div className="mt-4">
                                <div className="text-sm font-medium">Lernmodus</div>
                                <div className="mt-2 grid grid-cols-1 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setLearnMode("LEITNER_TODAY")}
                                        className={`rounded-2xl border p-4 text-left transition active:scale-[0.99] ${learnMode === "LEITNER_TODAY"
                                            ? "border-black bg-gray-50"
                                            : "border-gray-200 bg-white hover:bg-gray-50"
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="font-semibold">Heute fällig (Langzeit)</div>
                                                <div className="mt-1 text-sm text-gray-600">
                                                    Trainiert nur Karten, die heute dran sind – ideal fürs Langzeitgedächtnis.
                                                </div>
                                            </div>

                                            {learnMode === "LEITNER_TODAY" ? (
                                                <div className="shrink-0 rounded-full border border-black px-2 py-1 text-xs">
                                                    ✓
                                                </div>
                                            ) : null}
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setLearnMode("ALL_SHUFFLE")}
                                        className={`rounded-2xl border p-4 text-left transition active:scale-[0.99] ${learnMode === "ALL_SHUFFLE"
                                            ? "border-black bg-gray-50"
                                            : "border-gray-200 bg-white hover:bg-gray-50"
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="font-semibold">Alle Karten (Mix)</div>
                                                <div className="mt-1 text-sm text-gray-600">
                                                    Fragt alle Karten einmal zufällig ab – perfekt zum schnellen Check.
                                                </div>
                                            </div>

                                            {learnMode === "ALL_SHUFFLE" ? (
                                                <div className="shrink-0 rounded-full border border-black px-2 py-1 text-xs">
                                                    ✓
                                                </div>
                                            ) : null}
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4">
                                <div className="text-sm font-medium">Abfragerichtung</div>
                                <div className="mt-2 grid grid-cols-1 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setDirectionMode("DE_TO_SW")}
                                        className={`rounded-xl border p-3 text-left transition active:scale-[0.99] ${directionMode === "DE_TO_SW"
                                            ? "border-black bg-gray-50"
                                            : "border-gray-200 bg-white hover:bg-gray-50"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>Deutsch → Swahili</span>
                                            {directionMode === "DE_TO_SW" ? (
                                                <div className="shrink-0 rounded-full border border-black px-2 py-1 text-xs">
                                                    ✓
                                                </div>
                                            ) : null}
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setDirectionMode("SW_TO_DE")}
                                        className={`rounded-xl border p-3 text-left transition active:scale-[0.99] ${directionMode === "SW_TO_DE"
                                            ? "border-black bg-gray-50"
                                            : "border-gray-200 bg-white hover:bg-gray-50"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>Swahili → Deutsch</span>
                                            {directionMode === "SW_TO_DE" ? (
                                                <div className="shrink-0 rounded-full border border-black px-2 py-1 text-xs">
                                                    ✓
                                                </div>
                                            ) : null}
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setDirectionMode("RANDOM")}
                                        className={`rounded-xl border p-3 text-left transition active:scale-[0.99] ${directionMode === "RANDOM"
                                            ? "border-black bg-gray-50"
                                            : "border-gray-200 bg-white hover:bg-gray-50"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>Zufällig (Abwechslung)</span>
                                            {directionMode === "RANDOM" ? (
                                                <div className="shrink-0 rounded-full border border-black px-2 py-1 text-xs">
                                                    ✓
                                                </div>
                                            ) : null}
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <button
                                className={`mt-4 w-full rounded-xl p-3 text-white ${!learnMode || !directionMode ? "bg-gray-400" : "bg-black"
                                    }`}
                                type="button"
                                onClick={async () => {
                                    setStartHint(null);

                                    if (!learnMode || !directionMode) {
                                        setStartHint("Bitte wähle Lernmodus UND Abfragerichtung, bevor du startest.");
                                        return;
                                    }

                                    setLearnDone(false);
                                    setSessionCorrect(0);
                                    setShowSummary(false);

                                    const chosen =
                                        directionMode === "RANDOM"
                                            ? Math.random() < 0.5
                                                ? "DE_TO_SW"
                                                : "SW_TO_DE"
                                            : directionMode;

                                    setDirection(chosen);
                                    setReveal(false);
                                    setCurrentIndex(0);

                                    if (learnMode === "LEITNER_TODAY") {
                                        await loadToday();
                                        await loadLeitnerStats();
                                    } else {
                                        await loadAllForDrill();
                                    }

                                    setLearnStarted(true);
                                }}
                            >
                                Start
                            </button>

                            {startHint ? (
                                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                                    {startHint}
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* === KEINE KARTEN / ENDE === */}
                    {learnStarted && todayItems.length === 0 && (
                        <>
                            {learnMode === "LEITNER_TODAY" ? (
                                <div className="mt-4 rounded-2xl border p-4 bg-white">
                                    <div className="text-lg font-semibold">
                                        {learnDone ? "Heute erledigt ✅" : "Keine Karten fällig 🎉"}
                                    </div>

                                    <div className="mt-2 text-sm text-gray-700">
                                        {learnDone
                                            ? "Du hast deinen heutigen Leitner-Topf durch. Weiter so."
                                            : "Für heute ist nichts offen — sehr gut."}
                                    </div>

                                    {/* Lernstand */}
                                    <div className="mt-4 rounded-2xl border p-4">
                                        <div className="text-sm font-medium">Dein Lernstand</div>

                                        {/* Ergebnis (Leitner) */}
                                        {!leitnerStats ? (
                                            <div className="mt-2 text-sm text-gray-600">Lade Lernstand…</div>
                                        ) : (
                                            <>
                                                <div className="mt-3 space-y-2 text-sm">
                                                    {sessionTotal > 0 && (
                                                        <div className="mt-3 rounded-2xl border p-4">
                                                            <div className="text-sm font-semibold">
                                                                Ergebnis: {sessionCorrect}/{sessionTotal} gewusst{" "}
                                                                ({sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0}%)
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-gray-600">Karten im Training</span>
                                                        <span className="font-medium">{leitnerStats.total}</span>
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <span className="text-gray-600">Nächste Karte fällig</span>
                                                        <span className="font-medium">
                                                            {leitnerStats.nextDueInDays == null
                                                                ? "—"
                                                                : leitnerStats.nextDueInDays === 0
                                                                    ? "heute"
                                                                    : `in ${leitnerStats.nextDueInDays} Tag${leitnerStats.nextDueInDays === 1 ? "" : "en"
                                                                    }`}
                                                        </span>
                                                    </div>
                                                </div>

                                                {Array.isArray(leitnerStats.byLevel) && leitnerStats.byLevel.length > 0 ? (
                                                    <div className="mt-4">
                                                        <div className="text-xs font-medium text-gray-500">Verteilung</div>
                                                        <div className="mt-2 space-y-2">
                                                            {leitnerStats.byLevel.map((b) => (
                                                                <div key={b.level} className="flex items-center justify-between text-sm">
                                                                    <span className="text-gray-700">{b.label}</span>
                                                                    <span className="font-medium">{b.count}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : null}

                                                <div className="mt-4 rounded-xl bg-gray-50 border p-3 text-xs text-gray-600">
                                                    Tipp: Wenn heute nichts fällig ist, ist das ein gutes Zeichen – dein Rhythmus sitzt.
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <button
                                        className="mt-4 w-full rounded-xl bg-black text-white p-3"
                                        type="button"
                                        onClick={() => {
                                            setLearnStarted(false);
                                            setLearnDone(false);
                                            setShowSummary(false);

                                            setTodayItems([]);
                                            setCurrentIndex(0);
                                            setReveal(false);
                                            setStatus("");

                                            setLearnMode(null);
                                            setDirectionMode(null);
                                            setOpenDirectionChange(false);
                                        }}
                                    >
                                        Fertig
                                    </button>
                                </div>

                            ) : (
                                <div className="mt-4 rounded-2xl border p-4">
                                    <div className="text-sm font-medium">Session abgeschlossen ✅</div>

                                    {(() => {
                                        const total = sessionTotal > 0 ? sessionTotal : Math.max(sessionCorrect, 1);
                                        const pct = Math.round((sessionCorrect / total) * 100);

                                        return (
                                            <>
                                                <div className="mt-2 text-sm text-gray-700">
                                                    Ergebnis:{" "}
                                                    <span className="font-medium">
                                                        {sessionCorrect}/{total}
                                                    </span>{" "}
                                                    gewusst ({pct}%)
                                                </div>

                                                <div className="mt-4 grid grid-cols-2 gap-3">
                                                    <button
                                                        className="rounded-xl border p-3"
                                                        onClick={async () => {
                                                            setSessionCorrect(0);
                                                            setShowSummary(false);
                                                            setReveal(false);
                                                            setCurrentIndex(0);

                                                            await loadAllForDrill();

                                                            if (directionMode === "RANDOM") {
                                                                setDirection(Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE");
                                                            }

                                                            setLearnStarted(true);
                                                        }}
                                                    >
                                                        Wiederholen
                                                    </button>

                                                    <button
                                                        className="rounded-xl bg-black text-white p-3"
                                                        onClick={() => {
                                                            setLearnStarted(false);
                                                            setLearnDone(false);
                                                            setShowSummary(false);

                                                            setTodayItems([]);
                                                            setCurrentIndex(0);
                                                            setReveal(false);
                                                            setStatus("");

                                                            setLearnMode(null);
                                                            setDirectionMode(null);
                                                        }}
                                                    >
                                                        Fertig
                                                    </button>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </>
                    )}

                    {/* === LERNKARTE === */}
                    {learnStarted && todayItems.length > 0 && (
                        <div className="mt-4">
                            <div className="text-xs text-gray-500">
                                Karte {currentIndex + 1} / {todayItems.length}
                                {/* Session-Header: Richtung ändern (ohne Neustart) */}
                                <div className="mt-2 flex items-center justify-between gap-3">
                                    <div className="text-xs text-gray-500">
                                        Richtung:{" "}
                                        <span className="font-medium">
                                            {directionMode === "RANDOM"
                                                ? "Zufällig (Abwechslung)"
                                                : direction === "DE_TO_SW"
                                                    ? "Deutsch → Swahili"
                                                    : "Swahili → Deutsch"}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="rounded-xl border px-3 py-2 text-xs"
                                        onClick={() => setOpenDirectionChange((v) => !v)}
                                    >
                                        Richtung ändern
                                    </button>
                                </div>

                                {openDirectionChange ? (
                                    <div className="mt-3 rounded-2xl border p-3">
                                        <div className="text-sm font-medium">Abfragerichtung</div>

                                        <div className="mt-2 grid grid-cols-1 gap-2">
                                            <button
                                                type="button"
                                                className="rounded-xl border p-3 text-left"
                                                onClick={() => {
                                                    setDirectionMode("DE_TO_SW");
                                                    setDirection("DE_TO_SW");
                                                    setOpenDirectionChange(false);
                                                }}
                                            >
                                                Deutsch → Swahili
                                            </button>

                                            <button
                                                type="button"
                                                className="rounded-xl border p-3 text-left"
                                                onClick={() => {
                                                    setDirectionMode("SW_TO_DE");
                                                    setDirection("SW_TO_DE");
                                                    setOpenDirectionChange(false);
                                                }}
                                            >
                                                Swahili → Deutsch
                                            </button>

                                            <button
                                                type="button"
                                                className="rounded-xl border p-3 text-left"
                                                onClick={() => {
                                                    setDirectionMode("RANDOM");
                                                    const chosen = Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE";
                                                    setDirection(chosen);
                                                    setOpenDirectionChange(false);
                                                }}
                                            >
                                                Zufällig (Abwechslung)
                                            </button>
                                        </div>

                                        <p className="mt-2 text-xs text-gray-500">
                                            Tipp: „Zufällig“ würfelt ab jetzt pro Karte neu.
                                        </p>
                                    </div>
                                ) : null}
                            </div>

                            <div className="mt-3 rounded-2xl border p-4">
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        className="rounded-xl border px-3 py-2 text-xs"
                                        onClick={startEditFromLearn}
                                    >
                                        ✏️ Bearbeiten
                                    </button>
                                </div>

                                {currentImagePath ? (
                                    <div className="mt-3 rounded-2xl border bg-white overflow-hidden">
                                        <div className="w-full h-56 flex items-center justify-center bg-gray-50">
                                            <img
                                                src={`${IMAGE_BASE_URL}/${currentImagePath}`}
                                                alt="Bild"
                                                className="max-h-full max-w-full object-contain"
                                            />
                                        </div>
                                    </div>
                                ) : null}

                                <div className="mt-4 text-lg font-semibold">
                                    {direction === "DE_TO_SW"
                                        ? currentGerman
                                        : currentSwahili}
                                </div>

                                {!reveal ? (
                                    <button
                                        className="mt-4 w-full rounded-xl bg-black text-white p-3"
                                        onClick={revealCard}
                                    >
                                        Aufdecken
                                    </button>
                                ) : (
                                    <>
                                        <div className="mt-4 text-lg font-semibold">
                                            {direction === "DE_TO_SW" ? currentSwahili : currentGerman}
                                        </div>

                                        <div className="mt-3 flex items-center gap-2">
                                            {!todayItems[currentIndex]?.audio_path ? (
                                                <>
                                                    {!isRecording ? (
                                                        <button
                                                            type="button"
                                                            className="rounded-lg border px-3 py-2 text-sm"
                                                            onClick={startRecording}
                                                        >
                                                            🎙️ Aufnahme starten
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="rounded-lg border px-3 py-2 text-sm"
                                                            onClick={stopRecording}
                                                        >
                                                            ⏹️ Stop & Speichern
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="rounded-lg border px-3 py-2 text-sm"
                                                        onClick={() => playCardAudioIfExists(todayItems[currentIndex])}
                                                    >
                                                        🔊 Abspielen
                                                    </button>

                                                    {!isRecording ? (
                                                        <button
                                                            type="button"
                                                            className="rounded-lg border px-3 py-2 text-sm"
                                                            onClick={startRecording}
                                                        >
                                                            🎙️ Neu aufnehmen
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="rounded-lg border px-3 py-2 text-sm"
                                                            onClick={stopRecording}
                                                        >
                                                            ⏹️ Stop & Speichern
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        <div className="mt-4 grid grid-cols-2 gap-3">
                                            <button className="rounded-xl border p-3" onClick={() => gradeCurrent(false)}>
                                                Nicht gewusst
                                            </button>
                                            <button className="rounded-xl bg-black text-white p-3" onClick={() => gradeCurrent(true)}>
                                                Gewusst
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                </FullScreenSheet>

                {/* Create Modal */}
                <FullScreenSheet
                    open={openCreate}
                    title={editingId ? "Karte bearbeiten" : "Neue Wörter"}
                    onClose={() => {
                        setOpenCreate(false);
                        cancelEdit();
                        resetImageInputs();
                    }}
                >
                    <div className="rounded-2xl border p-4 shadow-sm bg-white">
                        <label className="block text-sm font-medium">Deutsch</label>
                        <input
                            className="mt-1 w-full rounded-xl border p-3"
                            value={german}
                            onChange={(e) => setGerman(e.target.value)}
                            placeholder="z.B. Guten Morgen"
                        />

                        <label className="block text-sm font-medium mt-4">Swahili</label>
                        <input
                            className="mt-1 w-full rounded-xl border p-3"
                            value={swahili}
                            onChange={(e) => setSwahili(e.target.value)}
                            placeholder="z.B. Habari za asubuhi"
                        />

                        <div className="mt-6 text-sm font-medium">Medien</div>
                        {!editingId && (
                            <div className="mt-4 rounded-xl border p-3">
                                <div className="text-sm font-medium">Aussprache</div>

                                <div className="mt-3 flex items-center gap-2">
                                    {pendingAudioBlob ? (
                                        <>
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={() => {
                                                    const url = URL.createObjectURL(pendingAudioBlob);
                                                    stopAnyAudio();
                                                    audioElRef.current = new Audio(url);
                                                    audioElRef.current.play().catch(() => { });
                                                }}
                                            >
                                                🔊 Abspielen
                                            </button>

                                            {!isRecording ? (
                                                <button
                                                    type="button"
                                                    className="rounded-xl border px-3 py-2"
                                                    onClick={startRecordingForCreate}
                                                >
                                                    🎙️ Neu aufnehmen
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="rounded-xl border px-3 py-2"
                                                    onClick={stopRecordingForCreate}
                                                >
                                                    ⏹️ Stop
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {!isRecording ? (
                                                <button
                                                    type="button"
                                                    className="rounded-xl border px-3 py-2"
                                                    onClick={startRecordingForCreate}
                                                >
                                                    🎙️ Aufnahme starten
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="rounded-xl border px-3 py-2"
                                                    onClick={stopRecordingForCreate}
                                                >
                                                    ⏹️ Stop
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>

                                <div className="mt-2 text-xs text-gray-500">
                                    Wird automatisch beim Speichern der Karte hochgeladen.
                                </div>
                            </div>
                        )}

                        <input
                            type="file"
                            accept="image/*"
                            id="image-upload"
                            className="hidden"
                            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                        />

                        {editingId && (
                            <div className="mt-4 rounded-xl border p-3">
                                <div className="text-sm font-medium">Aussprache</div>

                                <div className="mt-3 flex items-center gap-2">
                                    {editAudioPath ? (
                                        <>
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={() => playCardAudioIfExists({ audio_path: editAudioPath })}
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

                                <div className="mt-2 text-xs text-gray-500">
                                    Audio kann nur bei bestehenden Karten gespeichert werden.
                                </div>
                            </div>
                        )}

                        <div className="mt-4 text-sm font-medium">Bild</div>

                        <label
                            htmlFor="image-upload"
                            className="
                                flex items-center justify-center gap-3
                                rounded-2xl border-2 border-dashed
                                p-4 cursor-pointer
                                transition
                                hover:bg-gray-50 hover:border-gray-400
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
                                        <div className="text-xs text-gray-500">
                                            Tippen zum Austauschen
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-3xl">🖼️</div>
                                    <div className="text-sm">
                                        <div className="font-medium">Bild hinzufügen</div>
                                        <div className="text-xs text-gray-500">
                                            Tippen, um ein Bild auszuwählen
                                        </div>
                                    </div>
                                </>
                            )}
                        </label>

                        <button
                            type="button"
                            className="mt-3 w-full rounded-xl border p-3"
                            onClick={openImageSuggestions}
                        >
                            ✨ Bild vorschlagen
                        </button>

                        {suggestedImagePath ? (
                            <div className="mt-2 text-xs text-gray-500">
                                Vorschlagsbild ausgewählt ✅
                            </div>
                        ) : null}

                        {editingImagePath ? (
                            <div className="mt-3">
                                <div className="text-xs text-gray-500 mb-2">Aktuelles Bild</div>
                                <img
                                    src={`${IMAGE_BASE_URL}/${editingImagePath}`}
                                    alt="Aktuelles Bild"
                                    className="w-full max-h-56 object-contain rounded-2xl border bg-white"
                                />
                            </div>
                        ) : null}

                        {duplicateHint && (
                            <div className="mt-4 rounded-xl border p-4 bg-yellow-50 space-y-3">
                                <p className="text-sm font-medium">{duplicateHint}</p>

                                {/* Vorschau vorhandener Karten */}
                                {Array.isArray(duplicatePreview) && duplicatePreview.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-gray-600">Bereits vorhandene Karten:</p>

                                        {duplicatePreview.slice(0, 5).map((c: any) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                className="w-full flex items-center gap-3 rounded-lg border bg-white p-2 text-left hover:bg-gray-50 transition"
                                                onClick={() => {
                                                    // Duplikat direkt bearbeiten
                                                    const full = cards.find((x) => String(x.id) === String(c.id)) ?? c;
                                                    startEdit(full, "create");
                                                    setDuplicateHint(null);
                                                    setDuplicatePreview(null);
                                                    setOpenCreate(true);
                                                }}
                                            >

                                                {
                                                    c.image_path ? (
                                                        <img
                                                            src={`${IMAGE_BASE_URL}/${c.image_path}`}
                                                            alt="Bild"
                                                            className="w-10 h-10 rounded-md object-cover border"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-md border bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                                                            –
                                                        </div>
                                                    )
                                                }

                                                < div className="text-sm" >
                                                    <div className="font-medium">{c.german_text}</div>
                                                    <div className="text-gray-600">{c.swahili_text}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="flex gap-2 pt-2">
                                    <button
                                        className="flex-1 rounded-xl border px-3 py-2 text-sm"
                                        onClick={() => {
                                            setDuplicateHint(null);
                                            setDuplicatePreview(null);
                                        }}
                                    >
                                        Korrigieren
                                    </button>

                                    <button
                                        className="flex-1 rounded-xl bg-black text-white px-3 py-2 text-sm"
                                        onClick={() => createCard(true)}
                                    >
                                        Trotzdem speichern
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <button
                                className="rounded-xl bg-black text-white p-3 disabled:opacity-50"
                                onClick={saveCard}
                                disabled={!german || !swahili}
                                type="button"
                            >
                                {editingId ? "Speichern" : "Karte speichern"}
                            </button>

                            <button
                                className="rounded-xl border p-3"
                                type="button"
                                onClick={() => {
                                    setPendingAudioBlob(null);
                                    setPendingAudioType(null);
                                    setOpenCreate(false);
                                    cancelEdit();
                                    resetImageInputs();
                                }}
                            >
                                Abbrechen
                            </button>
                        </div>

                        {editingId && (
                            <button
                                type="button"
                                className="mt-3 w-full rounded-xl border p-3 text-red-600"
                                onClick={async () => {
                                    await deleteCard(editingId);
                                    setOpenCreate(false);
                                    cancelEdit();
                                    resetImageInputs();
                                }}
                            >
                                🗑️ Löschen
                            </button>
                        )}
                    </div>

                    {status ? (
                        <div className="mt-4 rounded-xl border bg-white p-3 text-sm">
                            {status}
                        </div>
                    ) : null}
                </FullScreenSheet>

                {/* Suggestion Modal */}
                <FullScreenSheet
                    open={suggestOpen}
                    title="Bildvorschläge"
                    onClose={() => setSuggestOpen(false)}
                >
                    {suggestLoading ? (
                        <div className="mt-4 text-sm text-gray-600">Lade Vorschläge…</div>
                    ) : suggestError ? (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                            {suggestError}
                        </div>
                    ) : suggestItems.length === 0 ? (
                        <div className="mt-4 text-sm text-gray-600">
                            Keine Treffer. Versuch ein anderes Wort (z.B. Singular) oder Swahili/Deutsch tauschen.
                        </div>
                    ) : (
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            {suggestItems.map((it) => (
                                <button
                                    key={it.pageId}
                                    type="button"
                                    className="rounded-xl border overflow-hidden hover:shadow-sm transition"
                                    onClick={() => chooseSuggestedImage(it.importUrl, it.thumb)}
                                >
                                    <img src={it.thumb} alt={it.title} className="w-full h-28 object-cover" />
                                    <div className="p-2 text-xs text-gray-600 line-clamp-2">{it.title}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </FullScreenSheet>

                {/* My Cards Modal */}
                <FullScreenSheet
                    open={openCards}
                    title="Meine Karten"
                    onClose={() => setOpenCards(false)
                    }
                >
                    <div className="rounded-2xl border p-4 bg-white">
                        {status ? (
                            <div className="mt-3 rounded-xl border p-3 text-sm bg-gray-50">
                                {status}
                            </div>
                        ) : null}

                        <div className="mt-3 text-sm text-gray-500">
                            {cards.length} Karten insgesamt.
                        </div>

                        {/* Liste */}
                        <div className="mt-4 space-y-3">
                            {cards.map((c) => (
                                <div key={c.id} className="rounded-xl border p-3">
                                    <div className="text-sm font-medium">
                                        {c.german_text} — {c.swahili_text}
                                    </div>

                                    <div className="mt-2 flex items-center gap-2">
                                        {c.image_path ? (
                                            <img
                                                src={`${IMAGE_BASE_URL}/${c.image_path}`}
                                                alt="Bild"
                                                className="w-12 h-12 object-cover rounded-lg border"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg border bg-gray-50" />
                                        )}

                                        {c.audio_path ? (
                                            <button
                                                type="button"
                                                className="rounded-lg border p-2 text-sm"
                                                onClick={() => playCardAudioIfExists(c)}
                                                aria-label="Audio abspielen"
                                                title="Audio abspielen"
                                            >
                                                🔊
                                            </button>
                                        ) : null}
                                    </div>

                                    <div className="mt-3 flex gap-2">
                                        <button
                                            className="rounded-xl border px-3 py-2 text-sm"
                                            onClick={() => {
                                                startEdit(c, "cards");
                                                setOpenCards(false);
                                                setOpenCreate(true);
                                            }}
                                        >
                                            Bearbeiten
                                        </button>

                                        <button
                                            className="rounded-xl border px-3 py-2 text-sm"
                                            onClick={() => deleteCard(c.id)}
                                        >
                                            Löschen
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {filteredCards.length === 0 ? (
                                <p className="text-sm text-gray-600">Keine Treffer.</p>
                            ) : null}
                        </div>
                    </div>
                </FullScreenSheet>

                {/* Search Modal */}
                <FullScreenSheet
                    open={openSearch}
                    title="Karte suchen"
                    onClose={() => {
                        setOpenSearch(false);
                        setSearch("");
                    }}
                >
                    <input
                        className="w-full rounded-xl border p-3"
                        placeholder="Deutsch oder Swahili eingeben…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <div className="mt-4 space-y-2">
                        {search.trim().length === 0 ? (
                            <p className="text-sm text-gray-500">
                                Tippe ein deutsches oder swahilisches Wort.
                            </p>
                        ) : filteredCards.length === 0 ? (
                            <p className="text-sm text-gray-600">
                                Keine Karte gefunden.
                            </p>
                        ) : (
                            <div className="mt-4 space-y-2">
                                {filteredCards.map((c) => (
                                    <div key={c.id} className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            className="flex-1 text-left rounded-xl border p-3 hover:bg-gray-50"
                                            onClick={() => {
                                                setOpenSearch(false);
                                                setSearch("");
                                                startEdit(c, "cards");
                                                setOpenCreate(true);
                                            }}
                                        >
                                            <div className="font-medium">
                                                {c.german_text} — {c.swahili_text}
                                            </div>
                                        </button>

                                        <button
                                            type="button"
                                            className="rounded-xl border p-3"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                deleteCard(c.id);
                                            }}
                                            aria-label="Karte löschen"
                                            title="Löschen"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </FullScreenSheet>
            </div >
        </main >
    );
}
