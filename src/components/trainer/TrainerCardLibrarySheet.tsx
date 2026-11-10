"use client";

import type { Group } from "@/lib/groups/types";
import type { TrainerLibraryCard } from "@/lib/trainer/useTrainerCardLibrary";
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
    onPlayAudio: (card: TrainerLibraryCard) => void;
    onEditCard: (card: TrainerLibraryCard) => void;
    onDeleteCard: (cardId: string) => void;
    onOpenCardGroupsEditor: (card: TrainerLibraryCard) => void;
    onCreateSentence: () => void;
};

export default function TrainerCardLibrarySheet(props: TrainerCardLibrarySheetProps) {
    return <SentenceLibrarySheet key={props.open ? "library-open" : "library-closed"} {...props} />;
}
