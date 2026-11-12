"use client";

import type { Group } from "@/lib/groups/types";
import type { TrainerLibraryCard } from "@/lib/trainer/useTrainerCardLibrary";
import type { LibrarySortOrder } from "@/lib/trainer/cardLibraryBehavior";
import type { WordEnrichment } from "@/lib/word/understanding";
import type { DetailReturn } from "@/components/trainer/CardDetailSheet";
import SentenceLibrarySheet from "@/components/trainer/SentenceLibrarySheet";

export type TrainerCardLibrarySheetProps = {
    open: boolean;
    title: string;
    cardsLoadState: "idle" | "loading" | "loaded" | "error";
    cardsLoadError: string | null;
    status: string;
    groups: Group[];
    isSentenceTrainer: boolean;
    imageBaseUrl: string;
    selectionMode: boolean;
    selectedIds: Set<string>;
    selectedTotalCount: number;
    countLabel: string;
    groupFilter: string[];
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
    sortOrder: LibrarySortOrder;
    onSortOrderChange: (order: LibrarySortOrder) => void;
    hasActiveGroupFilter: boolean;
    visibleCards: TrainerLibraryCard[];
    filteredCardsCount: number;
    canLoadMore: boolean;
    onClose: () => void;
    onRetryLoad: () => void;
    onSelectionModeChange: (next: boolean) => void;
    onSelectVisible: () => void;
    onClearSelection: () => void;
    onDeleteSelected: () => void;
    onGroupFilterChange: (groupIds: string[]) => void;
    onOpenDuplicateReview: () => void;
    onOpenManageGroups: () => void;
    onLoadMore: () => void;
    onToggleSelected: (cardId: string | number) => void;
    onPlayAudio: (card: TrainerLibraryCard) => HTMLAudioElement | null | void;
    onEditCard: (card: TrainerLibraryCard) => void;
    onEditFromDetail: (card: TrainerLibraryCard, note: string | null) => void;
    returnToDetail: DetailReturn | null;
    onDetailClosed: () => void;
    onWordUnderstandingSaved: (cardId: string, enrichment: WordEnrichment) => void;
    onDeleteCard: (cardId: string) => void;
    onOpenCardGroupsEditor: (card: TrainerLibraryCard) => void;
    onCreateSentence: () => void;
};

export default function TrainerCardLibrarySheet(props: TrainerCardLibrarySheetProps) {
    return <SentenceLibrarySheet key={props.open ? "library-open" : "library-closed"} {...props} />;
}
