"use client";

import { useEffect, useState } from "react";
import FullScreenSheet from "@/components/FullScreenSheet";
import GroupColorDot from "@/components/groups/GroupColorDot";
import { SentenceFeatureIcon } from "@/components/trainer/SentenceFormDisclosure";
import WordLibraryCard from "@/components/trainer/WordLibraryCard";
import SentenceLibraryCard from "@/components/trainer/SentenceLibraryCard";
import type { TrainerCardLibrarySheetProps } from "@/components/trainer/TrainerCardLibrarySheet";

function LibraryIcon({ name, className = "h-4 w-4" }: { name: "more" | "check" | "edit" | "trash" | "chevron" | "close"; className?: string }) {
    const paths = {
        more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
        check: <path d="m5 12 4 4L19 6" />,
        edit: <><path d="m15 5 4 4M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /></>,
        trash: <><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v6m4-6v6" /></>,
        chevron: <path d="m7 10 5 5 5-5" />,
        close: <path d="M5 5 19 19M19 5 5 19" />,
    };
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>;
}

export default function SentenceLibrarySheet({
    open,
    title,
    isSentenceTrainer,
    imageBaseUrl,
    cardsLoadState,
    cardsLoadError,
    status,
    groups,
    selectionMode,
    selectedIds,
    selectedTotalCount,
    countLabel,
    groupFilter,
    hasActiveGroupFilter,
    visibleCards,
    filteredCardsCount,
    canLoadMore,
    onClose,
    onRetryLoad,
    onSelectionModeChange,
    onSelectVisible,
    onClearSelection,
    onDeleteSelected,
    onGroupFilterChange,
    onOpenDuplicateReview,
    onOpenManageGroups,
    onLoadMore,
    onToggleSelected,
    onPlayAudio,
    onEditCard,
    onDeleteCard,
    onOpenCardGroupsEditor,
    onCreateSentence,
}: TrainerCardLibrarySheetProps) {
    const [adminMenuOpen, setAdminMenuOpen] = useState(false);
    const [activeActionId, setActiveActionId] = useState<string | null>(null);
    const activeGroup = groups.find((group) => group.id === groupFilter[0]);
    const noun = isSentenceTrainer ? "Sätze" : "Wörter";
    const singular = isSentenceTrainer ? "Satz" : "Wort";

    useEffect(() => {
        if (!adminMenuOpen && !activeActionId) return;
        function closeOnOutside(event: PointerEvent) {
            if (!(event.target instanceof Element) || !event.target.closest("[data-sentence-library-menu]")) {
                setAdminMenuOpen(false);
                setActiveActionId(null);
            }
        }
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setAdminMenuOpen(false);
                setActiveActionId(null);
            }
        }
        document.addEventListener("pointerdown", closeOnOutside);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutside);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [adminMenuOpen, activeActionId]);

    function beginSelection() {
        setAdminMenuOpen(false);
        setActiveActionId(null);
        onSelectionModeChange(true);
    }

    function finishSelection() {
        onSelectionModeChange(false);
        onClearSelection();
    }

    return <FullScreenSheet open={open} title={title} subtitle="Deutsch ↔ Kiswahili" presentation="sentence" onClose={onClose}>
        <div className="sentence-library space-y-5" data-testid={isSentenceTrainer ? "sentence-library" : "word-library"}>
            <header className="sentence-library-intro">
                <div className="min-w-0">
                    <p className="sentence-library-eyebrow">Deine Lernsammlung</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-[color:var(--foreground)]">
                        {cardsLoadState === "loaded" ? `${filteredCardsCount} ${filteredCardsCount === 1 ? singular : noun}` : title}
                    </p>
                    <p className="mt-1 text-sm text-muted">{isSentenceTrainer ? "Sätze wiederfinden, verfeinern und weiterlernen." : "Deine Wörter wiederfinden und weiterlernen."}{!isSentenceTrainer && groups.length > 0 ? ` · ${groups.length} ${groups.length === 1 ? "Gruppe" : "Gruppen"}` : ""}</p>
                </div>
                {cardsLoadState === "loaded" && canLoadMore ? <span className="text-xs font-medium text-muted">{countLabel}</span> : null}
            </header>

            {status ? <div className="sentence-library-message" role="status">{status}</div> : null}

            <div className="sentence-library-toolbar" aria-label={isSentenceTrainer ? "Satzbibliothek-Werkzeuge" : "Kartenbibliothek-Werkzeuge"}>
                <div className="sentence-library-filter">
                    <span className="sr-only" id="sentence-library-group-filter-label">Nach Gruppen filtern</span>
                    <select
                        aria-labelledby="sentence-library-group-filter-label"
                        value={groupFilter[0] ?? ""}
                        onChange={(event) => onGroupFilterChange(event.target.value ? [event.target.value] : [])}
                        className="sentence-library-select"
                    >
                        <option value="">Alle Gruppen</option>
                        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                    <LibraryIcon name="chevron" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                </div>

                <button type="button" className={`sentence-library-toolbar-button ${selectionMode ? "is-active" : ""}`} onClick={selectionMode ? finishSelection : beginSelection} aria-pressed={selectionMode}>
                    <LibraryIcon name="check" />
                    <span>{selectionMode ? "Auswahl beenden" : "Mehrfachauswahl"}</span>
                </button>

                <div className="relative ml-auto" data-sentence-library-menu>
                    <button type="button" className="sentence-library-toolbar-button" aria-expanded={adminMenuOpen} aria-controls="sentence-library-admin-menu" onClick={() => { setAdminMenuOpen((current) => !current); setActiveActionId(null); }}>
                        <LibraryIcon name="more" />
                        <span>Mehr</span>
                    </button>
                    <div id="sentence-library-admin-menu" hidden={!adminMenuOpen} className="sentence-library-menu right-0 top-full mt-2">
                        <button type="button" onClick={() => { setAdminMenuOpen(false); onOpenDuplicateReview(); }}>Dubletten prüfen</button>
                        <button type="button" onClick={() => { setAdminMenuOpen(false); onOpenManageGroups(); }}>Gruppen verwalten</button>
                    </div>
                </div>
            </div>

            {hasActiveGroupFilter ? <div className="sentence-library-active-filter">
                <span className="inline-flex min-w-0 items-center gap-2"><GroupColorDot color={activeGroup?.color} /><span className="truncate">Gruppe: {activeGroup?.name ?? "Ausgewählt"}</span></span>
                <button type="button" onClick={() => onGroupFilterChange([])} className="sentence-library-filter-reset"><LibraryIcon name="close" className="h-3.5 w-3.5" />Filter zurücksetzen</button>
            </div> : null}

            {selectionMode ? <div className="sentence-library-selection-bar" role="status">
                <span className="font-semibold">{selectedTotalCount} ausgewählt</span>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onSelectVisible} disabled={visibleCards.length === 0}>Sichtbare auswählen</button>
                    <button type="button" onClick={onClearSelection} disabled={selectedTotalCount === 0}>Auswahl leeren</button>
                    <button type="button" className="is-danger" onClick={onDeleteSelected} disabled={selectedTotalCount === 0}>Ausgewählte löschen</button>
                </div>
            </div> : null}

            {cardsLoadState === "loading" ? <div className="sentence-library-grid" aria-label={`${noun} werden geladen`} aria-busy="true">
                {[0, 1, 2, 3].map((index) => <div key={index} className="sentence-library-skeleton"><div /><div /><div /></div>)}
            </div> : null}

            {cardsLoadState === "error" ? <div className="sentence-library-empty" role="alert">
                <p className="text-lg font-semibold">{noun} konnten nicht geladen werden</p>
                <p className="mt-1 text-sm text-muted">{cardsLoadError ?? "Bitte versuche es erneut."}</p>
                <button type="button" className="btn btn-secondary mt-4" onClick={onRetryLoad}>Erneut laden</button>
            </div> : null}

            {cardsLoadState === "loaded" && filteredCardsCount === 0 ? <div className="sentence-library-empty">
                <span className="sentence-library-empty-icon"><SentenceFeatureIcon name="notes" className="h-6 w-6" /></span>
                <p className="mt-4 text-xl font-bold tracking-tight">{hasActiveGroupFilter ? `${noun} in dieser Gruppe nicht gefunden` : isSentenceTrainer ? "Noch keine Sätze" : "Noch keine Wörter"}</p>
                <p className="mt-2 max-w-sm text-sm text-muted">{hasActiveGroupFilter ? `Wähle eine andere Gruppe oder zeige wieder alle ${noun} an.` : isSentenceTrainer ? "Lege deinen ersten Satz an und baue deine eigene Lernsammlung auf." : "Lege dein erstes Wort an und baue deine persönliche Lernsammlung auf."}</p>
                {hasActiveGroupFilter ? <button type="button" className="btn btn-secondary mt-5" onClick={() => onGroupFilterChange([])}>{`Alle ${noun} anzeigen`}</button> : <button type="button" className="btn btn-primary mt-5" onClick={onCreateSentence}>{isSentenceTrainer ? "Ersten Satz anlegen" : "Erstes Wort anlegen"}</button>}
            </div> : null}

            {cardsLoadState === "loaded" && visibleCards.length > 0 ? <div className={`sentence-library-grid ${!isSentenceTrainer ? "word-library-grid" : ""}`}>
                {visibleCards.map((card) => {
                    const id = String(card.id);
                    const selected = selectedIds.has(id);
                    const actionOpen = activeActionId === id;
                    if (!isSentenceTrainer) return <WordLibraryCard
                        key={id}
                        card={card}
                        imageBaseUrl={imageBaseUrl}
                        selected={selected}
                        selectionMode={selectionMode}
                        actionOpen={actionOpen}
                        onToggleSelected={onToggleSelected}
                        onToggleActions={() => { setActiveActionId(actionOpen ? null : id); setAdminMenuOpen(false); }}
                        onPlayAudio={onPlayAudio}
                        onEditCard={(nextCard) => { setActiveActionId(null); onEditCard(nextCard); }}
                        onOpenCardGroupsEditor={(nextCard) => { setActiveActionId(null); onOpenCardGroupsEditor(nextCard); }}
                        onDeleteCard={(cardId) => { setActiveActionId(null); onDeleteCard(cardId); }}
                    />;
                    return <SentenceLibraryCard key={id} card={card} selected={selected} selectionMode={selectionMode} actionOpen={actionOpen}
                        onToggleSelected={onToggleSelected}
                        onPlayAudio={onPlayAudio}
                        onToggleActions={() => { setActiveActionId(actionOpen ? null : id); setAdminMenuOpen(false); }}
                        onEditCard={(nextCard) => { setActiveActionId(null); onEditCard(nextCard); }}
                        onOpenCardGroupsEditor={(nextCard) => { setActiveActionId(null); onOpenCardGroupsEditor(nextCard); }}
                        onDeleteCard={(cardId) => { setActiveActionId(null); onDeleteCard(cardId); }} />;
                })}
            </div> : null}

            {cardsLoadState === "loaded" && canLoadMore ? <button type="button" className="sentence-library-load-more" onClick={onLoadMore}>{`Mehr ${noun} laden`}</button> : null}
        </div>
    </FullScreenSheet>;
}
