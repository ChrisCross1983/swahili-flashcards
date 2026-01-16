"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { initFeedbackSounds, playCorrect, playWrong } from "@/lib/audio/sounds";
import FullScreenSheet from "@/components/FullScreenSheet";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
    formatDays,
    getIntervalDays,
    getNextLevelOnWrong,
    MAX_LEVEL,
} from "@/lib/leitner";

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
    const [learnMode, setLearnMode] = useState<"LEITNER_TODAY" | "DRILL" | null>(null);
    const [drillSource, setDrillSource] = useState<"ALL" | "LAST_MISSED" | null>(null);
    const [cardSelection, setCardSelection] = useState<"ALL_CARDS" | "LAST_MISSED" | null>(null);
    const [openDirectionChange, setOpenDirectionChange] = useState(false);
    const [learnStarted, setLearnStarted] = useState(false);
    const [returnToLearn, setReturnToLearn] = useState(false);
    const [directionMode, setDirectionMode] = useState<"DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null>(null);
    const [learnDone, setLearnDone] = useState(false);
    const [sessionCorrect, setSessionCorrect] = useState(0);
    const [sessionWrongIds, setSessionWrongIds] = useState<Set<string>>(new Set());
    const [sessionWrongItems, setSessionWrongItems] = useState<Record<string, any>>({});
    const [sessionTotal, setSessionTotal] = useState(0);
    const [showSummary, setShowSummary] = useState(false);
    const [endedEarly, setEndedEarly] = useState(false);
    const [lastMissedEmpty, setLastMissedEmpty] = useState(false);
    const [leitnerInfoOpen, setLeitnerInfoOpen] = useState(false);
    const [legacyKey, setLegacyKey] = useState<string | null>(null);
    const [showMigrate, setShowMigrate] = useState(false);
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
    const [createDraft, setCreateDraft] = useState<{ german: string; swahili: string } | null>(null);
    const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
    const [setupCounts, setSetupCounts] = useState({
        todayDue: 0,
        totalCards: 0,
        lastMissedCount: 0,
    });
    const [setupCountsLoading, setSetupCountsLoading] = useState(false);
    const [drillMenuOpen, setDrillMenuOpen] = useState(false);

    const router = useRouter();

    const editingCard = cards.find((c) => c.id === editingId) ?? null;

    const editingImagePath =
        selectedSuggestPath ?? (editingCard?.image_path ?? null);

    const [leitnerStats, setLeitnerStats] = useState<null | {
        total: number;
        byLevel: { level: number; label: string; count: number }[];
        dueTodayCount: number;
        dueTomorrowCount: number;
        dueLaterCount: number;
        nextDueDate: string | null;
        nextDueInDays: number | null;
    }>(null);

    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const audioElRef = useRef<HTMLAudioElement | null>(null);
    const sessionSavedRef = useRef(false);
    const learnModeRef = useRef<HTMLDivElement | null>(null);
    const directionRef = useRef<HTMLDivElement | null>(null);
    const drillSourceRef = useRef<HTMLDivElement | null>(null);
    const drillMenuRef = useRef<HTMLDivElement | null>(null);
    const leitnerInfoRef = useRef<HTMLDivElement | null>(null);

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

    function triggerSetupHighlight(target: "LEARNMODE" | "DIRECTION" | "DRILLSOURCE") {
        const targetRef =
            target === "LEARNMODE"
                ? learnModeRef
                : target === "DIRECTION"
                    ? directionRef
                    : drillSourceRef;

        targetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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

    const refreshSetupCounts = useCallback(async () => {
        setSetupCountsLoading(true);

        try {
            const res = await fetch(`/api/learn/setup-counts?ownerKey=${ownerKey}`);
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error ?? "Setup counts failed");
            }

            setSetupCounts({
                todayDue: json.todayDue ?? 0,
                totalCards: json.totalCards ?? 0,
                lastMissedCount: json.lastMissedCount ?? 0,
            });
        } catch {
            setSetupCounts({
                todayDue: 0,
                totalCards: 0,
                lastMissedCount: 0,
            });
        } finally {
            setSetupCountsLoading(false);
        }
    }, [ownerKey]);

    useEffect(() => {
        if (!openLearn) return;
        void refreshSetupCounts();
    }, [openLearn, refreshSetupCounts]);

    useEffect(() => {
        if (!drillMenuOpen) return;

        function handleClick(event: MouseEvent) {
            if (drillMenuRef.current && !drillMenuRef.current.contains(event.target as Node)) {
                setDrillMenuOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClick);
        return () => {
            document.removeEventListener("mousedown", handleClick);
        };
    }, [drillMenuOpen]);

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
                setOpenCreate(false);

                cancelEdit();
                resetImageInputs();

                setEditAudioPath(null);
                setPendingAudioBlob(null);
                setPendingAudioType(null);

                setReturnToLearn(false);
                setStatus("");

                return;
            }

            if (editSource === "create") {
                setOpenCards(false);
                setOpenCreate(true);

                setCreateDraft(null);

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

            const newPath = json.audio_path ?? null;

            setEditAudioPath(newPath);
            setStatus("Audio gespeichert ✅");

            // ✅ Cards-State direkt aktualisieren (ohne neu laden zu müssen)
            setCards((prev) =>
                prev.map((c) =>
                    String(c.id) === String(resolvedCardId) ? { ...c, audio_path: newPath } : c
                )
            );

            setTodayItems((prev) =>
                prev.map((it: any) => {
                    const itId = it.cardId ?? it.card_id ?? it.id;
                    if (String(itId) !== String(resolvedCardId)) return it;
                    return { ...it, audio_path: newPath };
                })
            );
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

    async function deleteCard(id: string): Promise<boolean> {
        const yes = confirm("Karte wirklich löschen?");
        if (!yes) return false;

        const res = await fetch(
            `/api/cards?ownerKey=${encodeURIComponent(ownerKey)}&id=${encodeURIComponent(id)}`,
            { method: "DELETE" }
        );
        const json = await res.json();

        if (!res.ok) {
            setStatus(json?.error || "Löschen fehlgeschlagen.");
            return false;
        }

        await loadCards(undefined, { silent: true });
        showToast("Karte gelöscht ✅");
        return true;
    }

    function startEditFromLearn() {
        const item = todayItems[currentIndex];
        if (!item) return;

        setReturnToLearn(true);

        setEditingId(String(item.cardId ?? item.id));
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
            return null;
        }

        const items = Array.isArray(json.items) ? json.items : [];

        setSessionTotal(items.length);

        setTodayItems(shuffleArray(items));
        setSessionCorrect(0);
        setCurrentIndex(0);
        setReveal(false);

        setSetupCounts((prev) => ({ ...prev, todayDue: items.length }));
        await refreshSetupCounts();

        setStatus(`Fällig heute: ${items.length}`);
        return items;
    }

    async function loadAllForDrill() {
        setStatus("Lade alle Karten...");
        setLastMissedEmpty(false);

        const res = await fetch(
            `/api/cards/all?ownerKey=${encodeURIComponent(ownerKey)}`, { cache: "no-store" }
        );

        const json = await res.json();

        if (!res.ok) {
            setStatus(json.error ?? "Aktion fehlgeschlagen.");
            return;
        }

        const items = (json.items ?? json.cards ?? []).map((c: any) => ({
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

        setSetupCounts((prev) => ({ ...prev, totalCards: items.length }));
        await refreshSetupCounts();

        setStatus(`Alle Karten: ${items.length}`);
    }

    async function loadLastMissed() {
        setStatus("Lade zuletzt nicht gewusste Karten...");
        setLastMissedEmpty(false);

        const res = await fetch(
            `/api/learn/last-missed?ownerKey=${encodeURIComponent(ownerKey)}`,
            { cache: "no-store" }
        );

        const json = await res.json();

        if (!res.ok) {
            setStatus(json.error ?? "Aktion fehlgeschlagen.");
            return;
        }

        const items = (json.items ?? json.cards ?? []).map((c: any) => ({
            cardId: c.id,
            level: 0,
            dueDate: null,
            german: c.german_text,
            swahili: c.swahili_text,
            imagePath: c.image_path ?? null,
            audio_path: c.audio_path ?? null,
        }));

        setSessionTotal(items.length);
        setSetupCounts((prev) => ({ ...prev, lastMissedCount: items.length }));
        await refreshSetupCounts();

        if (items.length === 0) {
            setTodayItems([]);
            setCurrentIndex(0);
            setReveal(false);
            setLastMissedEmpty(true);
            setStatus("Keine zuletzt nicht gewussten Karten.");
            return;
        }

        setTodayItems(shuffleArray(items));
        setCurrentIndex(0);
        setReveal(false);

        setStatus(`Zuletzt nicht gewusst: ${items.length}`);
    }

    function startDrillWithItems(items: any[]) {
        setLastMissedEmpty(false);
        setSessionTotal(items.length);
        setTodayItems(shuffleArray(items));
        setCurrentIndex(0);
        setReveal(false);
    }

    async function loadLeitnerStats() {
        const res = await fetch(
            `/api/learn/stats?ownerKey=${encodeURIComponent(ownerKey)}`,
            { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) return;

        setLeitnerStats(json);
    }

    function resetSessionTracking() {
        setSessionCorrect(0);
        setSessionTotal(0);
        setSessionWrongIds(new Set());
        setSessionWrongItems({});
        setShowSummary(false);
        setLearnDone(false);
        setLastMissedEmpty(false);
        setEndedEarly(false);
        setExitConfirmOpen(false);
        sessionSavedRef.current = false;
    }

    async function persistLearnSession(params: {
        mode: "LEITNER" | "DRILL";
        totalCount: number;
        correctCount: number;
        wrongCardIds: string[];
    }) {
        if (sessionSavedRef.current) return;
        sessionSavedRef.current = true;

        try {
            await fetch("/api/learn/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ownerKey,
                    mode: params.mode,
                    totalCount: params.totalCount,
                    correctCount: params.correctCount,
                    wrongCardIds: params.wrongCardIds,
                }),
            });
        } catch (e) {
            console.error("Failed to persist learn session", e);
        }
    }

    async function endSessionEarly() {
        setExitConfirmOpen(false);
        stopAnyAudio();

        if (isRecording) {
            stopRecording();
        }

        const answeredCount = Math.max(0, currentIndex);
        const correctCount = sessionCorrect;
        const wrongIds = Array.from(sessionWrongIds);

        if (wrongIds.length > 0) {
            await Promise.all(wrongIds.map((id) => updateLastMissed("add", id)));
        }

        await persistLearnSession({
            mode: learnMode === "DRILL" ? "DRILL" : "LEITNER",
            totalCount: answeredCount,
            correctCount,
            wrongCardIds: wrongIds,
        });
        await refreshSetupCounts();

        setSessionTotal(answeredCount);
        setReveal(false);
        setTodayItems([]);
        setLearnDone(false);
        setShowSummary(true);
        setEndedEarly(true);
    }

    function resolveCardId(item: any) {
        return String(item?.cardId ?? item?.card_id ?? item?.id ?? "").trim();
    }

    async function updateLastMissed(action: "add" | "remove", cardId: string) {
        if (!cardId) return false;
        try {
            const res = await fetch("/api/learn/last-missed", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ownerKey, cardId, action }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                console.error("last-missed update failed", json?.error ?? res.statusText);
                if (process.env.NODE_ENV === "development") {
                    setStatus(json?.error ?? "Last-Missed Update fehlgeschlagen.");
                }
                return false;
            }
            return true;
        } catch (e) {
            console.error("Failed to update last missed", e);
            if (process.env.NODE_ENV === "development") {
                setStatus("Last-Missed Update fehlgeschlagen.");
            }
            return false;
        }
    }

    function revealCard() {
        setReveal(true);

        const card = todayItems[currentIndex];
        playCardAudioIfExists(card);
    }

    async function gradeCurrent(correct: boolean) {
        if (isRecording) {
            stopRecording();
            return;
        }

        const item = todayItems[currentIndex];
        if (!item) return;

        if (correct) playCorrect();
        else playWrong();

        const cardId = resolveCardId(item);

        const nextCorrect = correct ? sessionCorrect + 1 : sessionCorrect;

        // Session-Statistik
        if (correct) setSessionCorrect(nextCorrect);

        const nextWrongIds = (() => {
            if (correct || !cardId) return new Set(sessionWrongIds);
            const updated = new Set(sessionWrongIds);
            updated.add(cardId);
            return updated;
        })();

        if (!correct && cardId) {
            setSessionWrongIds(nextWrongIds);
            setSessionWrongItems((prev) => (prev[cardId] ? prev : { ...prev, [cardId]: item }));
            await updateLastMissed("add", cardId);
        }

        const nextIndex = currentIndex + 1;

        // === DRILL MODUS: NUR EINMAL DURCHLAUFEN (KEINE DB-ÄNDERUNG, KEIN WIEDERHOLEN) ===
        if (learnMode === "DRILL") {
            // Wenn Drill auf "LAST_MISSED" läuft und Karte richtig war: last-missed in DB löschen
            if (drillSource === "LAST_MISSED" && correct) {
                const cardId = resolveCardId(item);
                if (cardId) {
                    const removed = await updateLastMissed("remove", cardId);
                    if (removed) {
                        setSetupCounts((prev) => ({
                            ...prev,
                            lastMissedCount: Math.max(0, prev.lastMissedCount - 1),
                        }));
                        void refreshSetupCounts();
                    }
                }
            }

            if (nextIndex >= todayItems.length) {
                await persistLearnSession({
                    mode: "DRILL",
                    totalCount: sessionTotal,
                    correctCount: nextCorrect,
                    wrongCardIds: Array.from(nextWrongIds),
                });
                await refreshSetupCounts();
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
                    cardId: resolveCardId(item),
                    correct,
                    currentLevel: Number.isFinite(item?.level) ? item.level : 0,
                }),
            });
        } catch (e) {
            console.error(e);
        }

        if (nextIndex >= todayItems.length) {
            await persistLearnSession({
                mode: "LEITNER",
                totalCount: sessionTotal,
                correctCount: nextCorrect,
                wrongCardIds: Array.from(nextWrongIds),
            });
            await loadLeitnerStats();
            await refreshSetupCounts();
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

    function handleCancelEdit() {
        if (returnToLearn) {
            setReturnToLearn(false);
            setOpenCreate(false);

            cancelEdit();
            resetImageInputs();

            setEditAudioPath(null);
            setPendingAudioBlob(null);
            setPendingAudioType(null);

            return;
        }

        if (editSource === "create" && editingId && createDraft) {
            setEditingId(null);
            setEditAudioPath(null);

            setGerman(createDraft.german);
            setSwahili(createDraft.swahili);

            setCreateDraft(null);

            resetImageInputs();
            setDuplicateHint(null);
            setDuplicatePreview(null);

            setPendingAudioBlob(null);
            setPendingAudioType(null);
            setStatus("");

            return;
        }

        if (editSource === "create" && !editingId) {
            setOpenCreate(false);

            setGerman("");
            setSwahili("");
            resetImageInputs();

            setDuplicateHint(null);
            setDuplicatePreview(null);

            setPendingAudioBlob(null);
            setPendingAudioType(null);

            setEditAudioPath(null);
            setStatus("");

            return;
        }

        setOpenCreate(false);

        cancelEdit();
        resetImageInputs();

        setEditAudioPath(null);
        setPendingAudioBlob(null);
        setPendingAudioType(null);

        setOpenCards(true);
    }

    function toggleLearnRecording() {
        if (isRecording) stopRecording();
        else startRecording();
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

    const currentLevel = Number.isFinite(currentItem?.level)
        ? Number(currentItem?.level)
        : 0;

    const currentDueDate =
        currentItem?.dueDate ?? currentItem?.due_date ?? null;

    const nextOnCorrectLevel = Math.min(currentLevel + 1, MAX_LEVEL);
    const nextOnCorrectDays = getIntervalDays(nextOnCorrectLevel);
    const nextOnWrongLevel = getNextLevelOnWrong(currentLevel);
    const nextOnWrongDays = getIntervalDays(nextOnWrongLevel);

    const footerNextDays = nextOnCorrectDays;

    const formattedDueDate = (() => {
        if (!currentDueDate) return null;
        const due = new Date(`${currentDueDate}T00:00:00`);
        if (Number.isNaN(due.getTime())) return currentDueDate;
        return new Intl.DateTimeFormat("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }).format(due);
    })();

    const dueStatusText = (() => {
        if (!currentDueDate) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(`${currentDueDate}T00:00:00`);
        if (Number.isNaN(due.getTime())) return null;
        const diffMs = due.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
            const pastDays = Math.abs(diffDays);
            return pastDays === 1 ? "seit 1 Tag fällig" : `seit ${pastDays} Tagen fällig`;
        }
        if (diffDays === 0) {
            return "heute fällig";
        }
        return `fällig ${formatDays(diffDays)}`;
    })();

    useEffect(() => {
        setLeitnerInfoOpen(false);
    }, [currentIndex]);

    useEffect(() => {
        if (!leitnerInfoOpen) return;
        function handleClick(event: MouseEvent) {
            const target = event.target as Node;
            if (leitnerInfoRef.current && !leitnerInfoRef.current.contains(target)) {
                setLeitnerInfoOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => {
            document.removeEventListener("mousedown", handleClick);
        };
    }, [leitnerInfoOpen]);

    const isLeitnerSelected = learnMode === "LEITNER_TODAY";
    const isDrillSelected = learnMode === "DRILL";

    const isSessionRunning =
        learnStarted &&
        (todayItems.length > 0 || currentIndex > 0 || reveal) &&
        !learnDone &&
        !showSummary &&
        !endedEarly &&
        (isLeitnerSelected || isDrillSelected);

    const leitnerUi = (() => {
        if (!leitnerStats) {
            return {
                total: 0,
                todayCount: 0,
                tomorrowCount: 0,
                laterCount: 0,
                nextText: "—",
            };
        }

        const total = Number(leitnerStats.total ?? 0);

        const todayCount = Number(leitnerStats.dueTodayCount ?? 0);
        const tomorrowCount = Number(leitnerStats.dueTomorrowCount ?? 0);
        const laterCount = Number(leitnerStats.dueLaterCount ?? 0);

        const nextDue = leitnerStats.nextDueInDays;
        const nextText =
            nextDue == null
                ? "—"
                : nextDue === 0
                    ? "heute"
                    : nextDue === 1
                        ? "morgen"
                        : `in ${nextDue} Tagen`;

        return { total, todayCount, tomorrowCount, laterCount, nextText };
    })();

    const missingLearnMode = learnMode === null;
    const missingDirection = directionMode === null;
    const missingDrillSource = learnMode === "DRILL" && drillSource === null;
    const startDisabled = missingLearnMode || missingDirection || missingDrillSource;
    const learnModeHighlight = missingLearnMode && startDisabled;
    const drillSourceHighlight = missingDrillSource && startDisabled;
    const directionHighlight = missingDirection && startDisabled;
    const startHint = missingLearnMode
        ? "Lernmethode wählen"
        : missingDrillSource
            ? "Quelle wählen (Alle Karten / Zuletzt nicht gewusst)"
            : missingDirection
                ? "Abfragerichtung wählen"
                : null;

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
                            setDrillSource(null);
                            setDrillMenuOpen(false);

                            // Session reset
                            setTodayItems([]);
                            setCurrentIndex(0);
                            setReveal(false);
                            resetSessionTracking();

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
                        if (isSessionRunning) {
                            setExitConfirmOpen(true);
                            return;
                        }

                        if (learnStarted || showSummary || todayItems.length > 0 || learnDone || endedEarly) {
                            setLearnStarted(false);
                            setLearnDone(false);
                            setShowSummary(false);
                            setEndedEarly(false);
                            setTodayItems([]);
                            setCurrentIndex(0);
                            setReveal(false);
                            setStatus("");

                            setLearnMode(null);
                            setDirectionMode(null);
                            setDrillSource(null);
                            setDrillMenuOpen(false);
                            resetSessionTracking();

                            return;
                        }

                        setOpenLearn(false);
                        setDrillMenuOpen(false);
                    }}
                >
                    {/* === SETUP === */}
                    {!learnStarted && (
                        <div className="mt-4 rounded-2xl border p-4 bg-white">
                            <div className="text-sm font-medium">Einstellungen</div>
                            <p className="mt-1 text-sm text-gray-600">
                                Wähle Lernmethode, Abfragerichtung – dann starten wir.
                            </p>

                            <div
                                ref={learnModeRef}
                                className="mt-4"
                            >
                                <div
                                    className={
                                        learnModeHighlight
                                            ? "rounded-3xl p-2 ring-2 ring-red-400 bg-red-50/40"
                                            : ""
                                    }
                                >
                                    <div className="rounded-2xl bg-white p-4">
                                        <div className="text-sm font-medium">Lernmethode</div>
                                        <div className="mt-2 grid grid-cols-1 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setLearnMode("LEITNER_TODAY");
                                                    setDrillMenuOpen(false);
                                                }}
                                                className={`relative rounded-2xl border p-4 text-left transition active:scale-[0.99] ${isLeitnerSelected
                                                    ? "border-black bg-gray-50"
                                                    : "border-gray-200 bg-white hover:bg-gray-50"
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between gap-3 pr-10">
                                                    <div>
                                                        <div className="font-semibold">Heute fällig (Leitner - Langzeit)</div>
                                                        <div className="mt-1 text-sm text-gray-600">
                                                            Trainiert nur Karten, die heute dran sind – ideal fürs Langzeitgedächtnis.
                                                        </div>
                                                    </div>

                                                    {isLeitnerSelected ? (
                                                        <div className="shrink-0 rounded-full border border-black px-2 py-1 text-xs">
                                                            ✓
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div className="absolute right-4 top-4 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700">
                                                    {setupCountsLoading ? "…" : setupCounts.todayDue}
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setLearnMode("DRILL");
                                                    setDrillMenuOpen(false);
                                                    if (!drillSource) {
                                                        setTimeout(() => {
                                                            drillSourceRef.current?.scrollIntoView({
                                                                behavior: "smooth",
                                                                block: "center",
                                                            });
                                                        }, 0);
                                                    }
                                                }}
                                                className={`relative rounded-2xl border p-4 text-left transition active:scale-[0.99] ${isDrillSelected
                                                    ? "border-black bg-gray-50"
                                                    : "border-gray-200 bg-white hover:bg-gray-50"
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between gap-3 pr-10">
                                                    <div>
                                                        <div className="font-semibold">Alle Vokabeln lernen (ohne Leitner)</div>
                                                        <div className="mt-1 text-sm text-gray-600">
                                                            Trainiert Karten ohne Leitner-Update – ideal für Wiederholungen.
                                                        </div>
                                                    </div>

                                                    {isDrillSelected ? (
                                                        <div className="shrink-0 rounded-full border border-black px-2 py-1 text-xs">
                                                            ✓
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div className="absolute right-4 top-4 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700">
                                                    {setupCountsLoading ? "…" : setupCounts.totalCards}
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {learnMode === "DRILL" ? (
                                <div
                                    ref={drillSourceRef}
                                    className="mt-4"
                                >
                                    <div
                                        className={
                                            drillSourceHighlight
                                                ? "rounded-3xl p-2 ring-2 ring-red-400 bg-red-50/40"
                                                : ""
                                        }
                                    >
                                        <div className="rounded-2xl bg-white p-4">
                                            <div className="text-sm font-medium">Was willst du trainieren?</div>
                                            <div className="mt-2" ref={drillMenuRef}>
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center justify-between rounded-xl border bg-white p-3 text-left"
                                                    onClick={() => setDrillMenuOpen((prev) => !prev)}
                                                >
                                                    <span className={drillSource ? "text-gray-900" : "text-gray-400"}>
                                                        {drillSource === "ALL"
                                                            ? "Alle Karten"
                                                            : drillSource === "LAST_MISSED"
                                                                ? "Zuletzt nicht gewusst"
                                                                : "Bitte auswählen…"}
                                                    </span>
                                                    <span className="text-xs text-gray-400">▾</span>
                                                </button>

                                                {drillMenuOpen ? (
                                                    <div className="mt-2 space-y-2 rounded-xl border bg-white p-2 shadow-sm">
                                                        <button
                                                            type="button"
                                                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${drillSource === "ALL"
                                                                ? "bg-gray-100"
                                                                : "hover:bg-gray-50"
                                                                }`}
                                                            onClick={() => {
                                                                setDrillSource("ALL");
                                                                setDrillMenuOpen(false);
                                                            }}
                                                        >
                                                            <span>Alle Karten</span>
                                                            <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700">
                                                                {setupCountsLoading ? "…" : setupCounts.totalCards}
                                                            </span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${drillSource === "LAST_MISSED"
                                                                ? "bg-gray-100"
                                                                : "hover:bg-gray-50"
                                                                }`}
                                                            onClick={() => {
                                                                setDrillSource("LAST_MISSED");
                                                                setDrillMenuOpen(false);
                                                            }}
                                                        >
                                                            <span>Zuletzt nicht gewusst</span>
                                                            <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700">
                                                                {setupCountsLoading ? "…" : setupCounts.lastMissedCount}
                                                            </span>
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>
                                            {drillSource === null ? (
                                                <div className="mt-2 text-sm text-gray-600">
                                                    <div>Bitte Quelle auswählen.</div>
                                                    {!setupCountsLoading && setupCounts.lastMissedCount > 0 ? (
                                                        <div className="mt-1">
                                                            Es warten {setupCounts.lastMissedCount} Karten im &quot;Zuletzt nicht gewusst&quot; Topf.
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            <div
                                ref={directionRef}
                                className="mt-4"
                            >
                                <div
                                    className={
                                        directionHighlight
                                            ? "rounded-3xl p-2 ring-2 ring-red-400 bg-red-50/40"
                                            : ""
                                    }
                                >
                                    <div className="rounded-2xl bg-white p-4">
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
                                </div>
                            </div>

                            <button
                                className={`mt-4 w-full rounded-xl p-3 text-white ${startDisabled ? "bg-gray-400" : "bg-black"
                                    }`}
                                type="button"
                                onClick={async () => {

                                    if (!learnMode) {
                                        triggerSetupHighlight("LEARNMODE");
                                        return;
                                    }

                                    if (!directionMode) {
                                        triggerSetupHighlight("DIRECTION");
                                        return;
                                    }

                                    if (learnMode === "DRILL" && !drillSource) {
                                        triggerSetupHighlight("DRILLSOURCE");
                                        return;
                                    }

                                    resetSessionTracking();

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
                                        const items = await loadToday();          // ✅ FIX: items existiert jetzt
                                        await loadLeitnerStats();                 // ✅ Lernstand aktualisieren
                                        if (items && items.length === 0) {
                                            await persistLearnSession({
                                                mode: "LEITNER",
                                                totalCount: 0,
                                                correctCount: 0,
                                                wrongCardIds: [],
                                            });
                                        }
                                    } else {
                                        if (drillSource === "ALL") {
                                            await loadAllForDrill();
                                        } else {
                                            await loadLastMissed();
                                        }
                                    }

                                    setLearnStarted(true);
                                }}
                            >
                                Start
                            </button>

                            {
                                startHint ? (
                                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                                        {startHint}
                                    </div>
                                ) : null
                            }
                        </div >
                    )
                    }

                    {/* === KEINE KARTEN / ENDE === */}
                    {
                        learnStarted && todayItems.length === 0 && (
                            <>
                                {endedEarly ? (
                                    <div className="mt-4 rounded-2xl border p-6 bg-white">
                                        <div className="text-lg font-semibold">Session beendet</div>
                                        <div className="mt-2 text-sm text-gray-700">
                                            Du hast vorzeitig beendet – hier ist dein aktuelles Ergebnis.
                                        </div>

                                        {(() => {
                                            const answeredCount = sessionTotal;
                                            const wrongCount = sessionWrongIds.size;
                                            const pct =
                                                answeredCount > 0
                                                    ? Math.round((sessionCorrect / answeredCount) * 100)
                                                    : 0;

                                            return (
                                                <div className="mt-4 space-y-2 text-sm text-gray-700">
                                                    <div>
                                                        Gewusst:{" "}
                                                        <span className="font-medium">
                                                            {sessionCorrect}/{answeredCount}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        Nicht gewusst:{" "}
                                                        <span className="font-medium">
                                                            {wrongCount}/{answeredCount}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        Trefferquote:{" "}
                                                        <span className="font-medium">{pct}%</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        <button
                                            className="mt-6 w-full rounded-xl bg-black text-white p-3"
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
                                                setDrillSource(null);
                                                resetSessionTracking();
                                            }}
                                        >
                                            Fertig
                                        </button>
                                    </div>
                                ) : learnMode === "LEITNER_TODAY" ? (
                                    <div className="mt-4 rounded-2xl border p-6 bg-white">
                                        <div className="text-lg font-semibold">
                                            {learnDone ? "🎉 Training abgeschlossen" : "🎉 Heute ist frei"}
                                        </div>

                                        <div className="mt-2 text-sm text-gray-700">
                                            {learnDone
                                                ? "Für heute bist du fertig. Morgen geht’s entspannt weiter."
                                                : "Für heute ist nichts offen — dein Rhythmus passt."}
                                        </div>

                                        {(() => {
                                            const total = sessionTotal;
                                            const pct = total > 0 ? Math.round((sessionCorrect / total) * 100) : 0;

                                            return (
                                                <div className="mt-3 text-sm text-gray-700">
                                                    Ergebnis:{" "}
                                                    <span className="font-medium">
                                                        {sessionCorrect}/{total}
                                                    </span>{" "}
                                                    gewusst ({pct}%)
                                                </div>
                                            );
                                        })()}

                                        {sessionWrongIds.size > 0 ? (
                                            <button
                                                className="mt-4 w-full rounded-xl border p-3"
                                                type="button"
                                                onClick={() => {
                                                    const repeatItems = Object.values(sessionWrongItems);
                                                    if (repeatItems.length === 0) return;

                                                    resetSessionTracking();

                                                    if (directionMode === "RANDOM") {
                                                        setDirection(Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE");
                                                    }

                                                    setLearnMode("DRILL");
                                                    setDrillSource("LAST_MISSED");
                                                    setLearnStarted(true);
                                                    setStatus("");

                                                    startDrillWithItems(repeatItems);
                                                }}
                                            >
                                                Nicht gewusste wiederholen
                                            </button>
                                        ) : null}

                                        {/* Lernstand */}
                                        <div className="mt-4 rounded-2xl border p-6">
                                            {/* 1) Heute */}
                                            <div className="text-sm font-medium">📊 Heute</div>

                                            {sessionTotal > 0 ? (
                                                <div className="mt-3 rounded-2xl border p-4">
                                                    <div className="text-base font-semibold flex items-center justify-between gap-3">
                                                        <span>
                                                            {sessionCorrect} von {sessionTotal} Karten sicher{" "}
                                                            <span className="text-gray-500 font-medium">
                                                                ({sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0}% gewusst)
                                                            </span>
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 text-sm text-gray-600">
                                                        {sessionTotal - sessionCorrect} Karten üben wir nochmal
                                                    </div>

                                                    <div className="mt-3 h-2 w-full rounded-full border">
                                                        <div
                                                            className="h-2 rounded-full"
                                                            style={{
                                                                width: `${Math.round((sessionCorrect / sessionTotal) * 100)}%`,
                                                                backgroundColor: "black",
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="mt-2 text-sm text-gray-600">Keine Session-Daten.</div>
                                            )}

                                            {/* 2) Gesamt */}
                                            <div className="mt-6 text-sm font-medium">🌱 Dein Lernstand</div>

                                            <div className="mt-3 rounded-2xl border p-4 text-sm">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-600">Karten insgesamt</span>
                                                    <span className="font-semibold">{leitnerUi.total}</span>
                                                </div>

                                                <div className="mt-4 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-gray-700">📅 Heute fällig</span>
                                                        <span className="font-medium">{leitnerUi.todayCount}</span>
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <span className="text-gray-700">🔁 Morgen dran</span>
                                                        <span className="font-medium">{leitnerUi.tomorrowCount}</span>
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <span className="text-gray-700">✅ Später wiederholen</span>
                                                        <span className="font-medium">{leitnerUi.laterCount}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 3) Nächstes */}
                                            <div className="mt-6 text-sm font-medium">⏰ Nächstes Training</div>
                                            <div className="mt-2 rounded-2xl border p-4 text-sm text-gray-700">
                                                Nächste Karten sind {leitnerUi.nextText} dran.
                                            </div>

                                            {/* 4) Tipp */}
                                            <div className="mt-4 rounded-2xl border p-4 text-sm text-gray-600">
                                                Tipp: Kurze, regelmäßige Sessions bringen mehr als lange Lernphasen.
                                            </div>
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
                                                setDrillSource(null);
                                                resetSessionTracking();
                                            }}
                                        >
                                            Fertig
                                        </button>
                                    </div>
                                ) : learnMode === "DRILL" && drillSource === "LAST_MISSED" && lastMissedEmpty ? (
                                    <div className="mt-4 rounded-2xl border p-6 bg-white">
                                        <div className="text-lg font-semibold">
                                            Keine zuletzt nicht gewussten Karten 🎉
                                        </div>
                                        <div className="mt-2 text-sm text-gray-700">
                                            Du hast in der letzten Session alle Karten gewusst.
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
                                                setDrillSource(null);
                                                resetSessionTracking();
                                            }}
                                        >
                                            Fertig
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-4 rounded-2xl border p-6 bg-white">
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

                                                    <div className="mt-6 grid grid-cols-2 gap-4">
                                                        <button
                                                            className="rounded-xl bg-black text-white p-3"
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
                                                                setDrillSource(null);
                                                                resetSessionTracking();
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
                        )
                    }

                    {/* === LERNKARTE === */}
                    {
                        learnStarted && todayItems.length > 0 && (() => {
                            const answeredCount = Math.max(0, currentIndex); // bereits bewertete Karten
                            const safeAnswered = Math.max(0, answeredCount);
                            const safeCorrect = Math.min(sessionCorrect, safeAnswered);
                            const computedPct =
                                safeAnswered === 0 ? 0 : Math.round((safeCorrect / safeAnswered) * 100);
                            const safePct = Math.max(0, Math.min(100, computedPct));

                            return (
                                <>
                                    {/* ===== Session Header (clean) ===== */}
                                    <div className="mb-3">
                                        {/* Row 1: Progress + % */}
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm text-gray-600">
                                                Karte <span className="font-medium text-gray-900">{currentIndex + 1}</span> von{" "}
                                                <span className="font-medium text-gray-900">{todayItems.length}</span>
                                            </div>

                                            <div className="rounded-full border px-3 py-1 text-sm text-gray-700 bg-white">
                                                ✔︎{" "}
                                                <span className="font-medium">
                                                    {answeredCount === 0 ? "—" : `${safePct}%`}
                                                </span>{" "}
                                                <span className="text-gray-500">sicher</span>
                                            </div>
                                        </div>

                                        {/* Row 2: Direction + Change Button */}
                                        <div className="mt-2 flex items-center justify-between gap-3">
                                            <div className="text-sm text-gray-600">
                                                Richtung:{" "}
                                                <span className="font-medium text-gray-900">
                                                    {directionMode === "RANDOM"
                                                        ? "Zufällig (Abwechslung)"
                                                        : direction === "DE_TO_SW"
                                                            ? "Deutsch → Swahili"
                                                            : "Swahili → Deutsch"}
                                                </span>
                                            </div>

                                            <button
                                                type="button"
                                                className="rounded-xl border px-4 py-2 text-sm whitespace-nowrap"
                                                onClick={() => setOpenDirectionChange((v) => !v)}
                                            >
                                                Richtung ändern
                                            </button>
                                        </div>

                                        {/* Dropdown */}
                                        {openDirectionChange ? (
                                            <div className="mt-3 rounded-2xl border p-3 bg-white">
                                                <div className="text-sm font-medium">Abfragerichtung</div>

                                                <div className="mt-2 grid grid-cols-1 gap-2">
                                                    <button
                                                        type="button"
                                                        className="rounded-xl border p-3 text-left hover:bg-gray-50"
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
                                                        className="rounded-xl border p-3 text-left hover:bg-gray-50"
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
                                                        className="rounded-xl border p-3 text-left hover:bg-gray-50"
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

                                    {/* ===== Card ===== */}
                                    <div className="mt-3 rounded-2xl border p-6">
                                        {/* Top Actions Row */}
                                        <div className="flex items-center justify-between gap-3">
                                            {/* Links: Audio aufnehmen – nur wenn KEIN Audio existiert */}
                                            {!todayItems[currentIndex]?.audio_path ? (
                                                <button
                                                    type="button"
                                                    className="rounded-xl border px-4 py-2 text-sm"
                                                    onClick={toggleLearnRecording}
                                                >
                                                    {isRecording ? "⏹️ Stop & Speichern" : "🎙️ Audio aufnehmen"}
                                                </button>
                                            ) : (
                                                <div />
                                            )}

                                            {/* Rechts: Bearbeiten */}
                                            <button
                                                type="button"
                                                className="ml-auto rounded-xl border px-4 py-2 text-sm whitespace-nowrap"
                                                onClick={startEditFromLearn}
                                            >
                                                ✏️ Bearbeiten
                                            </button>
                                        </div>

                                        {/* Bild */}
                                        {reveal && currentImagePath ? (
                                            <div className="mt-6 rounded-2xl border bg-white overflow-hidden">
                                                <div className="w-full h-56 flex items-center justify-center bg-gray-50">
                                                    <img
                                                        src={`${IMAGE_BASE_URL}/${currentImagePath}`}
                                                        alt="Bild"
                                                        className="max-h-full max-w-full object-contain"
                                                    />
                                                </div>
                                            </div>
                                        ) : null}

                                        {/* Prompt */}
                                        <div className="mt-8">
                                            <div className="text-xs text-gray-500 uppercase tracking-wide">
                                                {direction === "DE_TO_SW" ? "Deutsch" : "Swahili"}
                                            </div>
                                            <div
                                                className={`mt-1 text-2xl font-semibold ${direction === "DE_TO_SW" ? "text-gray-900" : "text-emerald-600"
                                                    }`}
                                            >
                                                {direction === "DE_TO_SW" ? currentGerman : currentSwahili}
                                            </div>
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
                                                <div className="mt-4 border-t pt-4">
                                                    <div className="text-xs text-gray-500 uppercase tracking-wide">
                                                        {direction === "DE_TO_SW" ? "Swahili" : "Deutsch"}
                                                    </div>
                                                    <div
                                                        className={`mt-1 text-xl font-semibold ${direction === "DE_TO_SW" ? "text-emerald-600" : "text-gray-900"
                                                            }`}
                                                    >
                                                        {direction === "DE_TO_SW" ? currentSwahili : currentGerman}
                                                    </div>
                                                </div>

                                                {/* Audio abspielen */}
                                                {todayItems[currentIndex]?.audio_path ? (
                                                    <div className="mt-6">
                                                        <button
                                                            type="button"
                                                            className="rounded-xl border px-4 py-2 text-sm"
                                                            onClick={() => playCardAudioIfExists(todayItems[currentIndex])}
                                                        >
                                                            🔊 Abspielen
                                                        </button>
                                                    </div>
                                                ) : null}

                                                <div className="mt-10 grid grid-cols-2 gap-6">
                                                    <button
                                                        type="button"
                                                        className="rounded-2xl border p-4 text-sm font-medium bg-red-50 border-red-200 text-red-800 active:scale-[0.99]"
                                                        onClick={() => gradeCurrent(false)}
                                                    >
                                                        Nicht gewusst
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="rounded-2xl p-4 text-sm font-medium bg-green-600 text-white active:scale-[0.99]"
                                                        onClick={() => gradeCurrent(true)}
                                                    >
                                                        Gewusst
                                                    </button>
                                                </div>
                                            </>
                                        )}

                                        {isLeitnerSelected ? (
                                            <div className="mt-4 flex items-start justify-between gap-2 text-xs text-gray-500">
                                                <span>
                                                    Leitner · Stufe {currentLevel} · nächste Wiederholung{" "}
                                                    {formatDays(footerNextDays)}
                                                </span>

                                                <div className="relative" ref={leitnerInfoRef}>
                                                    <button
                                                        type="button"
                                                        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                                                        aria-label="Warum sehe ich diese Karte?"
                                                        onClick={() => setLeitnerInfoOpen((open) => !open)}
                                                    >
                                                        ?
                                                    </button>

                                                    {leitnerInfoOpen ? (
                                                        <div className="fixed inset-0 z-30 flex items-end justify-center px-4 pb-4 sm:absolute sm:inset-auto sm:top-full sm:left-1/2 sm:mt-2 sm:-translate-x-1/2 sm:items-start sm:justify-center sm:px-0 sm:pb-0">
                                                            <button
                                                                type="button"
                                                                className="absolute inset-0 bg-black/30 sm:hidden"
                                                                onClick={() => setLeitnerInfoOpen(false)}
                                                                aria-label="Popover schließen"
                                                            />
                                                            <div className="relative w-full max-w-[420px] rounded-2xl border bg-white p-4 text-xs leading-5 text-gray-700 shadow-lg sm:min-w-[320px] sm:max-w-[420px] sm:w-auto">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="font-semibold text-gray-900">
                                                                        Warum sehe ich diese Karte?
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        className="text-gray-400 hover:text-gray-600"
                                                                        onClick={() => setLeitnerInfoOpen(false)}
                                                                        aria-label="Popover schließen"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </div>

                                                                <div className="mt-3 space-y-2">
                                                                    <div>Aktuelle Leitner-Stufe: {currentLevel}</div>
                                                                    {formattedDueDate ? (
                                                                        <div>
                                                                            Fällig am: {formattedDueDate}
                                                                            {dueStatusText ? ` (${dueStatusText})` : ""}
                                                                        </div>
                                                                    ) : null}
                                                                    <div>
                                                                        Wenn gewusst: Stufe → {nextOnCorrectLevel},
                                                                        nächste Wiederholung {formatDays(nextOnCorrectDays)}
                                                                    </div>
                                                                    <div>
                                                                        Wenn nicht gewusst: Stufe → {nextOnWrongLevel},
                                                                        nächste Wiederholung {formatDays(nextOnWrongDays)}
                                                                    </div>                
                                                                </div>

                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ) : null}        
                                    </div>
                                </>
                            );
                        })()
                    }

                    <ConfirmDialog
                        open={exitConfirmOpen}
                        title="Training beenden?"
                        description="Willst du die Session wirklich beenden? Dein aktuelles Ergebnis wird gespeichert."
                        cancelLabel="Weiterlernen"
                        confirmLabel="Beenden"
                        onCancel={() => setExitConfirmOpen(false)}
                        onConfirm={endSessionEarly}
                    />

                </FullScreenSheet >

                {/* Create Modal */}
                < FullScreenSheet
                    open={openCreate}
                    title={editingId ? "Karte bearbeiten" : "Neue Wörter"}
                    onClose={handleCancelEdit}
                >
                    <div className="rounded-2xl border p-6 shadow-sm bg-white">
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
                            <div className="mt-2 rounded-xl border p-3">
                                <div className="text-sm font-medium">Aussprache</div>

                                <div className="mt-3 flex items-center gap-4">
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
                            <div className="mt-2 rounded-xl border p-2">
                                <div className="text-sm font-medium">Aussprache</div>

                                <div className="mt-4 flex items-center gap-3">
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
                                mt-2 flex items-center justify-center gap-3
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
                            className="mt-6 w-full rounded-xl border p-3"
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
                                                    setCreateDraft({ german, swahili });
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

                                                <div className="text-sm" >
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

                        <div className="mt-6 grid grid-cols-2 gap-4">
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
                                onClick={handleCancelEdit}
                            >
                                Abbrechen
                            </button>
                        </div>

                        {editingId && (
                            <button
                                type="button"
                                className="mt-3 w-full rounded-xl border p-3 text-red-600"
                                onClick={async () => {
                                    if (!editingId) return;

                                    const deleted = await deleteCard(editingId);
                                    if (!deleted) return; // <- bleibt im Edit-Sheet

                                    setOpenCreate(false);
                                    cancelEdit();
                                    resetImageInputs();
                                }}
                            >
                                🗑️ Löschen
                            </button>
                        )}
                    </div>

                    {
                        status ? (
                            <div className="mt-4 rounded-xl border bg-white p-3 text-sm">
                                {status}
                            </div>
                        ) : null
                    }
                </FullScreenSheet >

                {/* Suggestion Modal */}
                < FullScreenSheet
                    open={suggestOpen}
                    title="Bildvorschläge"
                    onClose={() => setSuggestOpen(false)}
                >
                    {
                        suggestLoading ? (
                            <div className="mt-4 text-sm text-gray-600" > Lade Vorschläge…</div>
                        ) : suggestError ? (
                            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                                {suggestError}
                            </div>
                        ) : suggestItems.length === 0 ? (
                            <div className="mt-4 text-sm text-gray-600">
                                Keine Treffer. Versuch ein anderes Wort (z.B. Singular) oder Swahili/Deutsch tauschen.
                            </div>
                        ) : (
                            <div className="mt-6 grid grid-cols-2 gap-4">
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
                </FullScreenSheet >

                {/* My Cards Modal */}
                < FullScreenSheet
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
                            {filteredCards.map((c) => (
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
                </FullScreenSheet >

                {/* Search Modal */}
                < FullScreenSheet
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
                </FullScreenSheet >
            </div >
        </main >
    );
}
