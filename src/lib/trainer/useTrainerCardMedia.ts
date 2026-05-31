"use client";

import { useEffect, useRef, useState } from "react";

const AUDIO_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-audio`;

export type SuggestItem = {
    pageId: string;
    importUrl: string;
    thumb: string;
    title: string;
};

export function useTrainerCardMedia({
    onStatus,
    onAudioUpdated,
}: {
    onStatus: (message: string) => void;
    onAudioUpdated: (cardId: string, audioPath: string | null) => void;
}) {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [suggestOpen, setSuggestOpen] = useState(false);
    const [suggestLoading, setSuggestLoading] = useState(false);
    const [selectedSuggestUrl, setSelectedSuggestUrl] = useState<string | null>(null);
    const [selectedSuggestPath, setSelectedSuggestPath] = useState<string | null>(null);
    const [suggestItems, setSuggestItems] = useState<SuggestItem[]>([]);
    const [suggestError, setSuggestError] = useState<string | null>(null);
    const [suggestedImagePath, setSuggestedImagePath] = useState<string | null>(null);
    const [editAudioPath, setEditAudioPath] = useState<string | null>(null);
    const [pendingAudioBlob, setPendingAudioBlob] = useState<Blob | null>(null);
    const [pendingAudioType, setPendingAudioType] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const audioElRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (!imageFile) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(imageFile);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [imageFile]);

    function stopAnyAudio() {
        if (audioElRef.current) {
            audioElRef.current.pause();
            audioElRef.current.currentTime = 0;
        }
    }

    function playAudioPath(path: string | null) {
        if (!path) return;
        const url = `${AUDIO_BASE_URL}/${path}`;
        stopAnyAudio();
        audioElRef.current = new Audio(url);
        audioElRef.current.play().catch(() => { });
    }

    function playPendingAudio() {
        if (!pendingAudioBlob) return;
        const url = URL.createObjectURL(pendingAudioBlob);
        stopAnyAudio();
        audioElRef.current = new Audio(url);
        audioElRef.current.play().catch(() => { });
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

    function resetAudioInputs() {
        setEditAudioPath(null);
        setPendingAudioBlob(null);
        setPendingAudioType(null);
        setIsRecording(false);
    }

    function resetMediaInputs() {
        resetImageInputs();
        resetAudioInputs();
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

    async function openImageSuggestions(german: string, swahili: string) {
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
            onStatus("Übernehme Bild...");
            setSuggestError(null);

            const res = await fetch("/api/images/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageUrl }),
            });
            const json = await res.json();

            if (!res.ok) {
                onStatus("");
                setSuggestError(json.error ?? "Bild konnte nicht übernommen werden.");
                return;
            }

            setSelectedSuggestUrl(imageUrl);
            setSelectedSuggestPath(json.path);
            setSuggestedImagePath(json.path);
            if (thumbUrl) setPreviewUrl(thumbUrl);
            setImageFile(null);
            onStatus("Bild übernommen ✅");
            setSuggestOpen(false);
        } catch (e) {
            console.error(e);
            onStatus("Bildübernahme fehlgeschlagen.");
        } finally {
            setSuggestLoading(false);
        }
    }

    function getSupportedAudioMimeType() {
        const candidates = [
            "audio/mp4",
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/ogg",
        ];
        return candidates.find((type) => (window as any).MediaRecorder?.isTypeSupported?.(type)) ?? "";
    }

    async function startRecordingForCreate() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = getSupportedAudioMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
            stream.getTracks().forEach((track) => track.stop());
            const rawType = recorder.mimeType || "audio/mp4";
            const baseType = rawType.split(";")[0];
            const blob = new Blob(chunksRef.current, { type: baseType });
            setPendingAudioBlob(blob);
            setPendingAudioType(baseType);
            onStatus("Audio bereit ✅ (wird beim Speichern hochgeladen)");
        };

        recorder.start();
        setIsRecording(true);
    }

    function stopRecordingForCreate() {
        const recorder = mediaRecorderRef.current;
        if (!recorder) return;
        recorder.stop();
        setIsRecording(false);
    }

    async function startRecordingForEdit(editingId: string | null) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = getSupportedAudioMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
        };

        recorder.onstop = async () => {
            stream.getTracks().forEach((track) => track.stop());
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

            const res = await fetch("/api/upload-audio", { method: "POST", body: fd });
            const json = await res.json();

            if (!res.ok) {
                console.error(json?.error || "Upload failed");
                onStatus(json?.error || "Upload fehlgeschlagen");
                return;
            }

            const newPath = json.audio_path ?? null;
            setEditAudioPath(newPath);
            onAudioUpdated(resolvedCardId, newPath);
            onStatus("Audio gespeichert ✅");
        };

        recorder.start();
        setIsRecording(true);
    }

    function stopRecordingForEdit() {
        const recorder = mediaRecorderRef.current;
        if (!recorder) return;
        recorder.stop();
        setIsRecording(false);
    }

    return {
        imageFile,
        setImageFile,
        previewUrl,
        setPreviewUrl,
        suggestOpen,
        setSuggestOpen,
        suggestLoading,
        selectedSuggestUrl,
        setSelectedSuggestUrl,
        selectedSuggestPath,
        setSelectedSuggestPath,
        suggestItems,
        setSuggestItems,
        suggestError,
        setSuggestError,
        suggestedImagePath,
        setSuggestedImagePath,
        editAudioPath,
        setEditAudioPath,
        pendingAudioBlob,
        setPendingAudioBlob,
        pendingAudioType,
        setPendingAudioType,
        isRecording,
        resetImageInputs,
        resetAudioInputs,
        resetMediaInputs,
        uploadImage,
        openImageSuggestions,
        chooseSuggestedImage,
        playAudioPath,
        playPendingAudio,
        startRecordingForCreate,
        stopRecordingForCreate,
        startRecordingForEdit,
        stopRecordingForEdit,
    };
}
