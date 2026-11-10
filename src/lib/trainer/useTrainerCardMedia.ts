"use client";

import { useEffect, useRef, useState } from "react";

export function illustrationPreviewFile(preview: string): File {
    const base64 = preview.match(/^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/)?.[1];
    if (!base64) throw new Error("invalid_preview");
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    return new File([bytes], "illustration.webp", { type: "image/webp" });
}

export async function uploadImageFile(imageFile: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", imageFile);
    let res: Response;
    try {
        res = await fetch("/api/upload-image", { method: "POST", body: formData });
    } catch {
        throw new Error("image_upload_failed");
    }
    const json = await res.json().catch(() => ({})) as { error?: string; path?: string };
    if (!res.ok || !json.path) {
        throw new Error(json.error === "image_too_large" ? "image_too_large" : "image_upload_failed");
    }
    return json.path;
}

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
    const [generationCooldownSeconds, setGenerationCooldownSeconds] = useState(0);
    const generationRetryAt = useRef(0);
    const generationLock = useRef(false);
    const generationSequence = useRef(0);
    const [editAudioPath, setEditAudioPath] = useState<string | null>(null);
    const [pendingAudioBlob, setPendingAudioBlob] = useState<Blob | null>(null);
    const [pendingAudioType, setPendingAudioType] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);

    const cooldownActive = generationCooldownSeconds > 0;
    useEffect(() => {
        if (!cooldownActive) return;
        const timer = window.setInterval(() => {
            setGenerationCooldownSeconds(Math.max(0, Math.ceil((generationRetryAt.current - Date.now()) / 1000)));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [cooldownActive]);

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
        generationSequence.current++;
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
        return imageFile ? uploadImageFile(imageFile) : null;
    }

    async function generateIllustration(german: string, swahili: string) {
        if (generationLock.current || Date.now() < generationRetryAt.current) return;
        generationLock.current = true;
        const sequence = ++generationSequence.current;
        setGenerationLoading(true);
        setGenerationError(null);
        setGeneratedPreview(null);
        try {
            const res = await fetch("/api/images/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ german, swahili, type: "vocab" }),
            });
            const json = await res.json().catch(() => ({})) as { preview?: string; error?: string; retryAfterSeconds?: number };
            if (sequence !== generationSequence.current) return;
            if (json.error === "unsuitable") {
                setGenerationError("Für diesen Begriff ist keine klare Illustration sinnvoll.");
                return;
            }
            if (!res.ok && (json.error === "image_generation_local_rate_limited" || json.error === "image_generation_upstream_rate_limited")) {
                const wait = Number.isFinite(json.retryAfterSeconds) ? Number(json.retryAfterSeconds) : Number(res.headers.get("Retry-After"));
                const seconds = Number.isFinite(wait) && wait > 0 ? Math.min(Math.ceil(wait), 86_400) : 30;
                generationRetryAt.current = Date.now() + seconds * 1000;
                setGenerationCooldownSeconds(seconds);
                setGenerationError(json.error === "image_generation_upstream_rate_limited"
                    ? "Die Bilderstellung ist gerade ausgelastet. Bitte versuche es gleich noch einmal."
                    : "Du hast vorerst alle Illustrationen erstellt. Bitte versuche es später erneut.");
                return;
            }
            if (!res.ok || !json.preview?.startsWith("data:image/webp;base64,")) throw new Error("failed");
            setGeneratedPreview(json.preview);
        } catch {
            if (sequence === generationSequence.current) setGenerationError("Die Illustration konnte gerade nicht erstellt werden.");
        } finally {
            generationLock.current = false;
            setGenerationLoading(false);
        }
    }

    function acceptIllustration() {
        if (!generatedPreview) return;
        setImageFile(illustrationPreviewFile(generatedPreview));
        setGeneratedPreview(null);
        setGenerationError(null);
        onStatus("Illustration übernommen – mit der Karte speichern.");
    }

    function discardIllustration() { generationSequence.current++; setGeneratedPreview(null); setGenerationError(null); }

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
        generationLoading,
        generationCooldownSeconds,
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
