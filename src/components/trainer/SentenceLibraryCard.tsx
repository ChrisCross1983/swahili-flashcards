"use client";

import { useRef } from "react";
import CardText from "@/components/ui/CardText";
import { SentenceFeatureIcon } from "@/components/trainer/SentenceFormDisclosure";
import FloatingLibraryMenu from "@/components/trainer/FloatingLibraryMenu";
import { LibraryFeatureStatus } from "@/components/trainer/LibraryFeatureStatus";
import type { TrainerLibraryCard } from "@/lib/trainer/useTrainerCardLibrary";

export default function SentenceLibraryCard({ card, selected, selectionMode, actionOpen, onToggleSelected, onToggleActions, onPlayAudio, onEditCard, onDeleteCard, onOpenCardGroupsEditor }: {
    card: TrainerLibraryCard; selected: boolean; selectionMode: boolean; actionOpen: boolean;
    onToggleSelected: (id: string | number) => void; onToggleActions: () => void;
    onPlayAudio: (card: TrainerLibraryCard) => void;
    onEditCard: (card: TrainerLibraryCard) => void; onDeleteCard: (id: string) => void;
    onOpenCardGroupsEditor: (card: TrainerLibraryCard) => void;
}) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const id = String(card.id);
    const name = card.german_text ?? "Satz";
    return <article className={`sentence-library-card sentence-library-card--status ${selected ? "is-selected" : ""}`} data-testid="sentence-library-card" data-selected={selected}>
        <div className="sentence-library-content">
            {selectionMode ? <label className="sentence-library-select-hit"><input type="checkbox" className="sentence-library-checkbox" checked={selected} onChange={() => onToggleSelected(card.id)} aria-label={`Satz auswählen: ${name}`} /></label> : null}
            <button type="button" className="sentence-library-card-main" onClick={() => selectionMode ? onToggleSelected(card.id) : onEditCard(card)} aria-label={selectionMode ? `Satz auswählen: ${name}` : `Satz bearbeiten: ${name}`}>
                <span className="min-w-0 flex-1">
                    <span className="sentence-library-language">DE</span><CardText as="span" className="sentence-library-german">{card.german_text}</CardText>
                    <span className="sentence-library-language mt-3">SW</span><CardText as="span" className="sentence-library-swahili">{card.swahili_text}</CardText>
                </span>
            </button>
            {!selectionMode ? <button ref={triggerRef} type="button" className="sentence-library-card-more" data-sentence-library-menu aria-label={`Aktionen für ${name}`} aria-expanded={actionOpen} aria-controls={`sentence-library-actions-${id}`} onClick={onToggleActions}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
            </button> : null}
        </div>
        <LibraryFeatureStatus features={[
            { icon: "image", name: "Illustration", present: Boolean(card.image_path) },
            { icon: "group", name: "Gruppe", present: Boolean(card.groups?.length) },
            { icon: "audio", name: "Aussprache", present: Boolean(card.audio_path), onActivate: () => onPlayAudio(card) },
            { icon: "notes", name: "Notiz", present: Boolean(card.has_note) },
            { icon: "grammar", name: "Lernerklärung", present: Boolean(card.sentence_explanation) },
        ]} />
        {!selectionMode ? <FloatingLibraryMenu open={actionOpen} triggerRef={triggerRef} id={`sentence-library-actions-${id}`}>
            <button type="button" onClick={() => onEditCard(card)}><SentenceFeatureIcon name="notes" className="h-4 w-4" />Bearbeiten</button>
            <button type="button" onClick={() => onOpenCardGroupsEditor(card)}><SentenceFeatureIcon name="group" className="h-4 w-4" />Gruppe</button>
            <button type="button" className="is-danger" onClick={() => onDeleteCard(id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v6m4-6v6" /></svg>Löschen</button>
        </FloatingLibraryMenu> : null}
    </article>;
}
