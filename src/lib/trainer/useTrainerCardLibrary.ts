"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { clearSelection, removeDeletedFromSelection, selectAllVisible, toggleSelection } from "@/lib/cards/selection";
import {
    CARD_LIBRARY_PAGE_SIZE,
    filterAndSortLibraryCards,
    type LibrarySortOrder,
    getLibraryCountLabel,
    getVisibleCards,
    nextVisibleCount,
    shouldShowLoadMore,
} from "@/lib/trainer/cardLibraryBehavior";
import type { WordEnrichment } from "@/lib/word/understanding";

export type TrainerLibraryCard = {
    id: string | number;
    german_text?: string | null;
    swahili_text?: string | null;
    image_path?: string | null;
    audio_path?: string | null;
    groups?: Array<{ id: string | number; name: string; color?: string | null }>;
    word_enrichment?: WordEnrichment | null;
    note_preview?: { main_notes?: string | null; memory_hint?: string | null; example_sentence?: string | null; confusion_note?: string | null } | null;
    [key: string]: unknown;
};

export function updateLibraryNoteStatus(cards: TrainerLibraryCard[], cardId: string, mainNotes: string): TrainerLibraryCard[] {
    const hasNote = mainNotes.trim().length > 0;
    return cards.map((card) => String(card.id) === cardId ? { ...card, has_note: hasNote || (card.type === "sentence" && Boolean(card.note_preview?.memory_hint?.trim() || card.note_preview?.example_sentence?.trim() || card.note_preview?.confusion_note?.trim())), note_preview: { ...card.note_preview, main_notes: mainNotes } } : card);
}

type UseTrainerCardLibraryParams = {
    itemLabel?: string;
    initialCards?: TrainerLibraryCard[];
};

export function filterCardsByGroups<T extends { groups?: Array<{ id: string | number }> }>(
    cards: T[],
    groupIds: string[]
): T[] {
    if (groupIds.length === 0) return cards;

    return cards.filter((card) => {
        const cardGroupIds = new Set((card.groups ?? []).map((group) => String(group.id)));
        return groupIds.some((id) => cardGroupIds.has(String(id)));
    });
}

export function useTrainerCardLibrary(params: UseTrainerCardLibraryParams = {}) {
    const [cards, setCards] = useState<TrainerLibraryCard[]>(params.initialCards ?? []);
    const [groupFilter, setGroupFilterState] = useState<string[]>([]);
    const [searchQuery, setSearchQueryState] = useState("");
    const [sortOrder, setSortOrder] = useState<LibrarySortOrder>("recent");
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [visibleCount, setVisibleCount] = useState(CARD_LIBRARY_PAGE_SIZE);
    const [duplicateReviewOpen, setDuplicateReviewOpen] = useState(false);

    const hasActiveGroupFilter = groupFilter.length > 0;

    const filteredCards = useMemo(
        () => filterAndSortLibraryCards(cards, searchQuery, groupFilter, sortOrder),
        [cards, groupFilter, searchQuery, sortOrder]
    );

    const visibleCards = useMemo(
        () => getVisibleCards(filteredCards, visibleCount),
        [filteredCards, visibleCount]
    );

    const countLabel = useMemo(() => getLibraryCountLabel({
        visible: visibleCards.length,
        total: filteredCards.length,
        filtered: hasActiveGroupFilter || Boolean(searchQuery.trim()),
        itemLabel: params.itemLabel,
    }), [filteredCards.length, hasActiveGroupFilter, searchQuery, params.itemLabel, visibleCards.length]);

    const canLoadMore = useMemo(
        () => shouldShowLoadMore(filteredCards.length, visibleCount),
        [filteredCards.length, visibleCount]
    );

    const selectedVisibleCount = useMemo(
        () => visibleCards.filter((card) => selectedIds.has(String(card.id))).length,
        [selectedIds, visibleCards]
    );

    const resetVisibleWindow = useCallback(() => {
        setVisibleCount(CARD_LIBRARY_PAGE_SIZE);
    }, []);

    const loadMore = useCallback(() => {
        setVisibleCount((current) => nextVisibleCount(current, CARD_LIBRARY_PAGE_SIZE, filteredCards.length));
    }, [filteredCards.length]);

    const clearSelected = useCallback(() => {
        setSelectedIds(clearSelection());
    }, []);

    const setGroupFilter = useCallback((nextGroupIds: string[]) => {
        setGroupFilterState(nextGroupIds);
        setVisibleCount(CARD_LIBRARY_PAGE_SIZE);
        setSelectedIds(clearSelection());
    }, []);

    const setSearchQuery = useCallback((query: string) => {
        setSearchQueryState(query);
        setVisibleCount(CARD_LIBRARY_PAGE_SIZE);
    }, []);

    const toggleSelected = useCallback((cardId: string | number) => {
        setSelectedIds((prev) => toggleSelection(prev, String(cardId)));
    }, []);

    const selectVisible = useCallback(() => {
        setSelectedIds(selectAllVisible(visibleCards.map((card) => String(card.id))));
    }, [visibleCards]);

    const resetForClose = useCallback(() => {
        setSelectionMode(false);
        setSelectedIds(clearSelection());
        setVisibleCount(CARD_LIBRARY_PAGE_SIZE);
    }, []);

    const removeDeletedCards = useCallback((deletedIds: string[]) => {
        if (deletedIds.length === 0) return;
        const deletedSet = new Set(deletedIds.map(String));
        setCards((prev) => prev.filter((card) => !deletedSet.has(String(card.id))));
        setSelectedIds((prev) => removeDeletedFromSelection(prev, deletedSet));
    }, []);

    return {
        cards,
        setCards: setCards as Dispatch<SetStateAction<TrainerLibraryCard[]>>,
        filteredCards,
        visibleCards,
        visibleCount,
        canLoadMore,
        loadMore,
        resetVisibleWindow,
        groupFilter,
        searchQuery,
        setSearchQuery,
        sortOrder,
        setSortOrder,
        setGroupFilter,
        hasActiveGroupFilter,
        selectedIds,
        setSelectedIds,
        selectionMode,
        setSelectionMode,
        toggleSelected,
        clearSelection: clearSelected,
        selectVisible,
        selectedVisibleCount,
        selectedTotalCount: selectedIds.size,
        countLabel,
        resetForClose,
        removeDeletedCards,
        duplicateReviewOpen,
        openDuplicateReview: () => setDuplicateReviewOpen(true),
        closeDuplicateReview: () => setDuplicateReviewOpen(false),
    };
}
