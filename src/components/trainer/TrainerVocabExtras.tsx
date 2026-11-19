"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import CompactOverlay from "@/components/CompactOverlay";
import { SentenceFeatureIcon, type SentenceFeatureIconName } from "@/components/trainer/SentenceFormDisclosure";
import TrainerLearningFeature from "@/components/trainer/TrainerLearningFeature";
import WordUnderstandingFeature from "@/components/trainer/WordUnderstandingFeature";
import type { WordEnrichment } from "@/lib/word/understanding";

type Extra = "understanding" | "image";
type Props = {
    cardId: string;
    german: string;
    swahili: string;
    imagePath: string | null;
    imageBaseUrl: string;
    enrichment: WordEnrichment | null;
    hasNote: boolean;
    notesOpen: boolean;
    hasAudio: boolean;
    isRecording: boolean;
    onAudio: () => void;
    onOpenNotes: () => void;
    onWordSaved: (cardId: string, enrichment: WordEnrichment) => void;
    onImageSaved: (cardId: string, change: { image_path?: string }) => void;
};

export default function TrainerVocabExtras({ cardId, german, swahili, imagePath, imageBaseUrl, enrichment, hasNote, notesOpen, hasAudio, isRecording, onAudio, onOpenNotes, onWordSaved, onImageSaved }: Props) {
    const [active, setActive] = useState<Extra | null>(null);
    const action = (kind: Extra | "notes", label: string, icon: SentenceFeatureIconName, present: boolean) => (
        <button
            key={kind}
            type="button"
            className={`flex min-h-12 min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)] sm:min-h-11 sm:flex-row sm:gap-1.5 sm:px-2 sm:text-sm ${present ? "border-[color:var(--accent-cta)] bg-accent-cta-soft text-accent-cta-strong" : "border-soft bg-surface-elevated text-primary hover:bg-surface-strong"}`}
            aria-label={`${label}${present ? " vorhanden" : ""} öffnen`}
            aria-haspopup="dialog"
            aria-expanded={kind === "notes" ? notesOpen : active === kind}
            data-present={present ? "true" : "false"}
            onClick={() => kind === "notes" ? onOpenNotes() : setActive(kind)}
        >
            <SentenceFeatureIcon name={icon} className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
        </button>
    );

    return <>
        <div className="grid grid-cols-4 gap-2" aria-label="Lernhilfen" data-testid="trainer-vocab-extras">
            {action("understanding", "Verstehen", "grammar", Boolean(enrichment))}
            {action("image", "Bild", "image", Boolean(imagePath))}
            {action("notes", "Notiz", "notes", hasNote)}
            <button type="button" onClick={onAudio} aria-label={hasAudio ? "Audio abspielen" : isRecording ? "Audioaufnahme stoppen und speichern" : "Audio aufnehmen"}
                data-present={hasAudio ? "true" : "false"} data-card-option-action="audio"
                className={`flex min-h-12 min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)] sm:min-h-11 sm:flex-row sm:gap-1.5 sm:px-2 sm:text-sm ${hasAudio ? "border-[color:var(--accent-cta)] bg-accent-cta-soft text-accent-cta-strong" : "border-soft bg-surface-elevated text-primary"}`}>
                <SentenceFeatureIcon name={hasAudio ? "speaker" : "audio"} className="h-4 w-4 shrink-0" /><span>{isRecording ? "Stop" : "Audio"}</span>
            </button>
        </div>
        {active === "understanding" && createPortal(<CompactOverlay open title="Wort verstehen" onClose={() => setActive(null)}>
            <WordUnderstandingFeature
                cardId={cardId} german={german} swahili={swahili} initialEnrichment={enrichment}
                embedded allowRegenerate={false} onSaved={onWordSaved}
            />
        </CompactOverlay>, document.body)}
        {active === "image" && createPortal(<CompactOverlay open title="Lernbild" onClose={() => setActive(null)}>
            {imagePath
                ? <Image src={`${imageBaseUrl}/${imagePath}`} alt="Lernbild zur Karte" width={320} height={240} unoptimized className="trainer-learning-image" />
                : <TrainerLearningFeature cardId={cardId} cardType="vocab" german={german} swahili={swahili} onSaved={onImageSaved} />}
        </CompactOverlay>, document.body)}
    </>;
}
