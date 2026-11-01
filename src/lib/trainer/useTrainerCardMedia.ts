"use client";

import { useEffect, useRef, useState } from "react";

const AUDIO_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-audio`;

export function useTrainerCardMedia({
    onStatus,
    onAudioUpdated,
}: {
    onStatus: (message: string) => void;
    onAudioUpdated: (cardId: string, audioPath: string | null) => void;
}) {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [generationLoading, setGenerationLoading] = useState(false);
    const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const generationLock = useRef(false);
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
        setGeneratedPreview(null);
        setGenerationError(null);
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

    async function generateIllustration(german: string, swahili: string) {
        if (generationLock.current) return;
        generationLock.current = true;
        setGenerationLoading(true);
        setGenerationError(null);
        setGeneratedPreview(null);
        try {
            const res = await fetch("/api/images/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ german, swahili, type: "vocab" }),
            });
            const json = await res.json() as { preview?: string; code?: string };
            if (json.code === "unsuitable") {
                setGenerationError("Für diesen Begriff ist keine klare Illustration sinnvoll.");
                return;
            }
            if (!res.ok || !json.preview?.startsWith("data:image/webp;base64,")) throw new Error("failed");
            setGeneratedPreview(json.preview);
        } catch {
            setGenerationError("Die Illustration konnte nicht erstellt werden. Bitte versuche es erneut.");
        } finally {
            generationLock.current = false;
            setGenerationLoading(false);
        }
    }

    function acceptIllustration() {
        if (!generatedPreview) return;
        const binary = atob(generatedPreview.split(",")[1]);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        setImageFile(new File([bytes], "illustration.webp", { type: "image/webp" }));
        setGeneratedPreview(null);
        setGenerationError(null);
        onStatus("Illustration übernommen – mit der Karte speichern.");
    }

    function discardIllustration() { setGeneratedPreview(null); setGenerationError(null); }

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
        generationLoading,
        generatedPreview,
        generationError,
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
        generateIllustration,
        acceptIllustration,
        discardIllustration,
        playAudioPath,
        playPendingAudio,
        startRecordingForCreate,
        stopRecordingForCreate,
        startRecordingForEdit,
        stopRecordingForEdit,
    };
}
