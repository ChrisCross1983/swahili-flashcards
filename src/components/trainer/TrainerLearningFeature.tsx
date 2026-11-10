"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import SentenceExplanationContent from "@/components/trainer/SentenceExplanationContent";
import { parseSentenceExplanation, type SentenceExplanation } from "@/lib/sentence/explanation";
import { illustrationPreviewFile, uploadImageFile, useTrainerCardMedia } from "@/lib/trainer/useTrainerCardMedia";
import type { CardType } from "@/lib/trainer/types";

type Props = { cardId: string; cardType: CardType; german: string; swahili: string; onSaved: (id: string, change: { image_path?: string; sentence_explanation?: SentenceExplanation }) => void };
const ignore = () => {};
export default function TrainerLearningFeature({ cardId, cardType, german, swahili, onSaved }: Props) {
    const media = useTrainerCardMedia({ onStatus: ignore, onAudioUpdated: ignore });
    const active = useRef(true);
    const lock = useRef(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [explanation, setExplanation] = useState<SentenceExplanation | null>(null);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    async function patch(change: { imagePath?: string; sentenceExplanation?: SentenceExplanation }) {
        const response = await fetch("/api/cards", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cardId, ...change }) });
        if (!response.ok) throw new Error("save_failed");
    }
    async function generateExplanation() {
        if (lock.current) return;
        lock.current = true; setLoading(true); setError(false);
        try {
            const res = await fetch("/api/sentence/explanation/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "sentence", german, swahili }) });
            const body = await res.json().catch(() => ({}));
            const parsed = parseSentenceExplanation(body.explanation);
            if (!res.ok || !parsed) throw new Error("generation_failed");
            if (!active.current) return;
            await patch({ sentenceExplanation: parsed });
            onSaved(cardId, { sentence_explanation: parsed });
            if (active.current) { setExplanation(parsed); setSuccess("Lernerklärung gespeichert"); }
        } catch { if (active.current) setError(true); }
        finally { lock.current = false; if (active.current) setLoading(false); }
    }
    async function acceptImage() {
        if (lock.current || !media.generatedPreview) return;
        lock.current = true; setSaving(true); setError(false);
        try {
            const path = await uploadImageFile(illustrationPreviewFile(media.generatedPreview));
            if (!active.current) return;
            await patch({ imagePath: path });
            onSaved(cardId, { image_path: path });
            if (active.current) { media.discardIllustration(); setSuccess("Illustration gespeichert"); }
        } catch { if (active.current) setError(true); }
        finally { lock.current = false; if (active.current) setSaving(false); }
    }
    if (cardType === "sentence") return <section className="trainer-learning-feature" aria-label="Grammatik verstehen">
        <h3>Grammatik verstehen</h3><p>Lass dir Satzbau und Wortbestandteile erklären.</p>
        {loading ? <div className="trainer-learning-loading" role="status">Lernerklärung wird erstellt …</div> : null}
        {explanation ? <SentenceExplanationContent explanation={explanation} /> : <button type="button" className="btn btn-secondary min-h-11" disabled={loading} onClick={() => void generateExplanation()}>{loading ? "Lernerklärung wird erstellt …" : error ? "Erneut versuchen" : "Lernerklärung erzeugen"}</button>}
        {error ? <p role="alert">Die Lernerklärung konnte gerade nicht erstellt werden.</p> : null}
        {success ? <p role="status">{success}</p> : null}
    </section>;
    return <section className="trainer-learning-feature" aria-label="Lernbild">
        <h3>Lernbild</h3><p>Erstelle eine Illustration, damit du dir das Wort leichter merken kannst.</p>
        {media.generationLoading ? <div className="trainer-learning-loading" role="status">Illustration wird erstellt …<small>Das kann einige Sekunden dauern.</small></div> : null}
        {media.generatedPreview ? <div><Image src={media.generatedPreview} alt="Neue Illustration zur Vorschau" width={256} height={256} unoptimized className="trainer-learning-image" />
            <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary min-h-11" disabled={saving} onClick={() => void acceptImage()}>{saving ? "Wird gespeichert …" : "Übernehmen"}</button><button type="button" className="btn btn-secondary min-h-11" disabled={saving || media.generationLoading || media.generationCooldownSeconds > 0} onClick={() => void media.generateIllustration(german, swahili)}>Neu erzeugen</button><button type="button" className="btn btn-ghost min-h-11" disabled={saving} onClick={media.discardIllustration}>Verwerfen</button></div></div> : <button type="button" className="btn btn-primary min-h-11" disabled={media.generationLoading || media.generationCooldownSeconds > 0} onClick={() => void media.generateIllustration(german, swahili)}>{media.generationLoading ? "Illustration wird erstellt …" : "Illustration erzeugen"}</button>}
        {media.generationError ? <p role="alert">{media.generationError}</p> : null}
        {error ? <p role="alert">Die Illustration konnte gerade nicht gespeichert werden. Bitte versuche es erneut.</p> : null}
        {success ? <p role="status">{success}</p> : null}
    </section>;
}
