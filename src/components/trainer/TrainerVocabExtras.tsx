"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import CompactOverlay from "@/components/CompactOverlay";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SentenceFeatureIcon, type SentenceFeatureIconName } from "@/components/trainer/SentenceFormDisclosure";
import WordUnderstandingFeature from "@/components/trainer/WordUnderstandingFeature";
import TrainerLearningFeature from "@/components/trainer/TrainerLearningFeature";
import type { WordEnrichment } from "@/lib/word/understanding";

type Extra = "understanding" | "image" | "audio";
const actionClass = "flex min-h-12 min-w-0 cursor-pointer touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[11px] font-semibold transition-[background-color,border-color,box-shadow,filter,transform] duration-150 hover:border-[color:var(--accent-primary)] hover:shadow-[0_2px_6px_rgba(74,44,16,0.1)] active:scale-[0.98] active:brightness-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)] sm:min-h-11 sm:flex-row sm:gap-1.5 sm:px-2 sm:text-sm";
const actionTone = (present: boolean) => present
    ? "border-[color:var(--accent-cta)] bg-accent-cta-soft text-accent-cta-strong hover:brightness-[0.96]"
    : "border-soft bg-surface-elevated text-primary hover:bg-surface-strong";
type Props = {
    cardId: string;
    german: string;
    swahili: string;
    enrichment: WordEnrichment | null;
    hasNote: boolean;
    notesOpen: boolean;
    hasAudio: boolean;
    isRecording: boolean;
    onAudio: () => void;
    onRemoveAudio?: () => Promise<boolean>;
    onOpenNotes: () => void;
    onWordSaved: (cardId: string, enrichment: WordEnrichment) => void;
    onWordRemoved?: (cardId: string) => void;
    imagePath: string | null;
    onImageSaved: (cardId: string, imagePath: string) => void;
};

export default function TrainerVocabExtras({ cardId, german, swahili, enrichment, hasNote, notesOpen, hasAudio, isRecording, onAudio, onRemoveAudio, onOpenNotes, onWordSaved, onWordRemoved, imagePath, onImageSaved }: Props) {
    const [active, setActive] = useState<Extra | null>(null);
    const [audioRemoveConfirmOpen, setAudioRemoveConfirmOpen] = useState(false);
    const [audioRemoving, setAudioRemoving] = useState(false);
    const [audioRemoveError, setAudioRemoveError] = useState<string | null>(null);

    async function removeAudio() {
        if (!onRemoveAudio || audioRemoving) return;
        setAudioRemoving(true);
        setAudioRemoveError(null);
        const removed = await onRemoveAudio();
        setAudioRemoving(false);
        if (removed) {
            setAudioRemoveConfirmOpen(false);
            setActive(null);
        } else {
            setAudioRemoveError("Audio konnte nicht entfernt werden. Bitte versuche es erneut.");
            setAudioRemoveConfirmOpen(false);
        }
    }
    const action = (kind: Extra | "notes", label: string, icon: SentenceFeatureIconName, present: boolean) => (
        <button
            key={kind}
            type="button"
            className={`${actionClass} ${actionTone(present)}`}
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
        <div className={`grid min-w-0 ${imagePath ? "grid-cols-3 gap-2" : "grid-cols-4 gap-1.5 sm:gap-2"}`} aria-label="Lernhilfen" data-testid="trainer-vocab-extras">
            {action("understanding", "Verstehen", "grammar", Boolean(enrichment))}
            {action("notes", "Notiz", "notes", hasNote)}
            <button type="button" onClick={() => setActive("audio")} aria-label="Audio öffnen" aria-haspopup="dialog" aria-expanded={active === "audio"}
                data-present={hasAudio ? "true" : "false"} data-card-option-action="audio"
                className={`${actionClass} ${actionTone(hasAudio)}`}>
                <SentenceFeatureIcon name={hasAudio ? "speaker" : "audio"} className="h-4 w-4 shrink-0" /><span>{isRecording ? "Stop" : "Audio"}</span>
            </button>
            {!imagePath ? action("image", "Bild", "image", false) : null}
        </div>
        {active === "understanding" && createPortal(<CompactOverlay open title="Wort verstehen" onClose={() => setActive(null)}>
            <WordUnderstandingFeature
                cardId={cardId} german={german} swahili={swahili} initialEnrichment={enrichment}
                embedded allowRegenerate={false} onSaved={onWordSaved} onRemoved={onWordRemoved}
            />
        </CompactOverlay>, document.body)}
        {active === "image" && !imagePath && createPortal(<CompactOverlay open title="Lernbild erstellen" onClose={() => setActive(null)}>
            <TrainerLearningFeature cardId={cardId} cardType="vocab" german={german} swahili={swahili} onSaved={(id, change) => {
                if (change.image_path) { onImageSaved(id, change.image_path); setActive(null); }
            }} />
        </CompactOverlay>, document.body)}
        {active === "audio" && createPortal(<CompactOverlay open title="Audio" onClose={() => setActive(null)}>
            <div className="space-y-3 text-sm text-muted">
                <p>{hasAudio ? "Gespeicherte Aussprache anhören." : isRecording ? "Aufnahme läuft." : "Nimm eine eigene Aussprache auf."}</p>
                <button type="button" className="btn btn-primary min-h-11 w-full" onClick={onAudio}>
                    {hasAudio ? "Audio abspielen" : isRecording ? "Aufnahme stoppen und speichern" : "Audio aufnehmen"}
                </button>
                {hasAudio && onRemoveAudio ? <button type="button" className="btn btn-utility min-h-11 w-full text-[color:var(--accent-danger-strong)] hover:bg-[color:var(--accent-danger-soft)]" disabled={audioRemoving} onClick={() => setAudioRemoveConfirmOpen(true)}>Audio entfernen</button> : null}
                {audioRemoveError ? <p role="alert" className="text-sm text-[color:var(--accent-danger-strong)]">{audioRemoveError}</p> : null}
            </div>
        </CompactOverlay>, document.body)}
        <ConfirmDialog open={audioRemoveConfirmOpen} title="Audio entfernen?" description="Die gespeicherte Aussprache dieser Karte wird entfernt." confirmLabel="Audio entfernen" cancelLabel="Abbrechen" destructive busy={audioRemoving} onConfirm={() => void removeAudio()} onCancel={() => setAudioRemoveConfirmOpen(false)} />
    </>;
}
