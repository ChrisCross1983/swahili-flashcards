import Image from "next/image";
import { useRef } from "react";
import CardText from "@/components/ui/CardText";
import { LibraryFeatureStatus } from "@/components/trainer/LibraryFeatureStatus";
import FloatingLibraryMenu, { positionLibraryMenu } from "@/components/trainer/FloatingLibraryMenu";
import { SentenceFeatureIcon } from "@/components/trainer/SentenceFormDisclosure";
import type { TrainerLibraryCard } from "@/lib/trainer/useTrainerCardLibrary";

type Props = {
    card: TrainerLibraryCard;
    imageBaseUrl: string;
    selected: boolean;
    selectionMode: boolean;
    actionOpen: boolean;
    onToggleSelected: (cardId: string | number) => void;
    onToggleActions: () => void;
    onPlayAudio: (card: TrainerLibraryCard) => void;
    onEditCard: (card: TrainerLibraryCard) => void;
    onOpenCardGroupsEditor: (card: TrainerLibraryCard) => void;
    onDeleteCard: (cardId: string) => void;
};

function ActionIcon({ name }: { name: "more" | "edit" | "trash" }) {
    const paths = {
        more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
        edit: <><path d="m15 5 4 4M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /></>,
        trash: <><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v6m4-6v6" /></>,
    };
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">{paths[name]}</svg>;
}

export const positionWordLibraryMenu = positionLibraryMenu;

export default function WordLibraryCard({
    card, imageBaseUrl, selected, selectionMode, actionOpen, onToggleSelected, onToggleActions,
    onPlayAudio, onEditCard, onOpenCardGroupsEditor, onDeleteCard,
}: Props) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const id = String(card.id);
    const word = card.german_text || "Wort";
    const cardGroups = card.groups ?? [];


    return <article className={`sentence-library-card word-library-card ${card.image_path ? "word-library-card--with-image" : ""} ${selected ? "is-selected" : ""} ${actionOpen ? "has-menu" : ""}`} data-testid="word-library-card" data-selected={selected}>
        <div className="word-library-head">
            {selectionMode ? <label className="sentence-library-select-hit word-library-top-action">
                <input type="checkbox" className="sentence-library-checkbox" checked={selected} onChange={() => onToggleSelected(card.id)} aria-label={`Wort auswählen: ${word}`} />
            </label> : <button ref={triggerRef} type="button" className="sentence-library-card-more word-library-top-action" data-sentence-library-menu aria-label={`Aktionen für ${word}`} aria-expanded={actionOpen} aria-controls={`word-library-actions-${id}`} onClick={onToggleActions}>
                <ActionIcon name="more" />
            </button>}
        </div>

        <button type="button" className="word-library-main" onClick={() => selectionMode ? onToggleSelected(card.id) : onEditCard(card)} aria-label={selectionMode ? `Wort auswählen: ${word}` : `Wort bearbeiten: ${word}`}>
            {card.image_path ? <Image src={`${imageBaseUrl}/${card.image_path}`} alt="" width={80} height={80} unoptimized className="word-library-thumb" /> : null}
            <span className="word-library-pair">
                <span className="word-library-language">DE</span><CardText as="span" className="word-library-german">{card.german_text}</CardText>
                <span className="word-library-language">SW</span><CardText as="span" className="word-library-swahili">{card.swahili_text}</CardText>
            </span>
        </button>

        <LibraryFeatureStatus features={[
            { icon: "image", name: "Illustration", present: Boolean(card.image_path) },
            { icon: "group", name: "Gruppe", present: cardGroups.length > 0 },
            { icon: "audio", name: "Aussprache", present: Boolean(card.audio_path), onActivate: () => onPlayAudio(card) },
            { icon: "notes", name: "Notiz", present: Boolean(card.has_note) },
        ]} />

        {!selectionMode ? <FloatingLibraryMenu open={actionOpen} triggerRef={triggerRef} id={`word-library-actions-${id}`}>
            <button type="button" onClick={() => onEditCard(card)}><ActionIcon name="edit" />Bearbeiten</button>
            <button type="button" onClick={() => onOpenCardGroupsEditor(card)} aria-label={`Gruppe ändern: ${word}`}><SentenceFeatureIcon name="group" className="h-4 w-4" />Gruppe</button>
            <button type="button" className="is-danger" onClick={() => onDeleteCard(id)}><ActionIcon name="trash" />Löschen</button>
        </FloatingLibraryMenu> : null}
    </article>;
}
