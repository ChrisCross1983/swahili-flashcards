"use client";

import FullScreenSheet from "@/components/FullScreenSheet";
import GroupBadge from "@/components/groups/GroupBadge";
import CardText from "@/components/ui/CardText";
import type { Group } from "@/lib/groups/types";
import { visibleBadgeSummary } from "@/lib/trainer/setup";
import type { TrainerLibraryCard } from "@/lib/trainer/useTrainerCardLibrary";

type TrainerCardLibrarySheetProps = {
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
};

export default function TrainerCardLibrarySheet({
    open,
    title,
    cardsLoadState,
    cardsLoadError,
    status,
    groups,
    isSentenceTrainer,
    imageBaseUrl,
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
}: TrainerCardLibrarySheetProps) {
    return (
        <FullScreenSheet
            open={open}
            title={title}
            onClose={onClose}
        >
            <div className="rounded-2xl border p-4 bg-surface">
                {cardsLoadState === "loading" ? (
                    <div className="mt-3 rounded-xl border p-3 text-sm bg-surface">Lade Karten…</div>
                ) : null}

                {cardsLoadState === "error" && cardsLoadError ? (
                    <div className="mt-3 rounded-xl border p-3 text-sm bg-surface">
                        <div>{cardsLoadError}</div>
                        <button
                            type="button"
                            className="mt-2 rounded-lg border px-3 py-1.5 text-xs"
                            onClick={onRetryLoad}
                        >
                            Erneut laden
                        </button>
                    </div>
                ) : null}

                {status ? (
                    <div className="mt-3 rounded-xl border p-3 text-sm bg-surface">
                        {status}
                    </div>
                ) : null}

                <div className="mt-3 text-sm text-muted">
                    {cardsLoadState === "loaded" ? (
                        countLabel
                    ) : cardsLoadState === "error" ? (
                        "Laden fehlgeschlagen."
                    ) : (
                        "Lade…"
                    )}
                </div>

                <div className="mt-3 rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-primary">
                            {selectionMode
                                ? `${selectedTotalCount} Karte(n) ausgewählt`
                                : "Mehrfachauswahl"}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {!selectionMode ? (
                                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => onSelectionModeChange(true)}>
                                    Auswählen
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className="rounded-lg border px-3 py-2 text-sm"
                                        onClick={onSelectVisible}
                                        disabled={visibleCards.length === 0}
                                    >
                                        Sichtbare auswählen
                                    </button>
                                    <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onClearSelection}>
                                        Auswahl leeren
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"
                                        disabled={selectedTotalCount === 0}
                                        onClick={onDeleteSelected}
                                    >
                                        Ausgewählte löschen
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg border px-3 py-2 text-sm"
                                        onClick={() => {
                                            onSelectionModeChange(false);
                                            onClearSelection();
                                        }}
                                    >
                                        Fertig
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-3 rounded-xl border p-3 space-y-3">
                    <div>
                        <label className="text-sm font-medium">Nach Gruppen filtern</label>
                        <select
                            className="mt-2 w-full rounded-xl border px-3 py-2 bg-transparent text-sm"
                            value={groupFilter[0] ?? ""}
                            onChange={(event) => {
                                onGroupFilterChange(event.target.value ? [event.target.value] : []);
                            }}
                        >
                            <option value="">Alle Karten</option>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>
                                    {group.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        {hasActiveGroupFilter ? (
                            <p className="text-xs text-muted">
                                Filter: {groups.find((group) => group.id === groupFilter[0])?.name ?? "1 Gruppe"}
                            </p>
                        ) : (
                            <p className="text-xs text-muted">Alle Karten werden angezeigt.</p>
                        )}
                        <div className="flex items-center gap-2">
                            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onOpenDuplicateReview}>Dubletten prüfen</button>
                            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onOpenManageGroups}>Gruppen verwalten</button>
                        </div>
                    </div>
                </div>

                <div className="mt-4 space-y-3">
                    {visibleCards.map((card) => (
                        <div key={card.id} className="rounded-xl border p-3">
                            <div className="flex items-start gap-3">
                                {selectionMode ? (
                                    <input
                                        type="checkbox"
                                        className="mt-1 h-4 w-4"
                                        checked={selectedIds.has(String(card.id))}
                                        onChange={() => onToggleSelected(card.id)}
                                        aria-label="Karte auswählen"
                                    />
                                ) : null}
                                <div className="flex-1 min-w-0">
                                    {isSentenceTrainer ? (
                                        <div className="space-y-1 text-sm font-medium min-w-0">
                                            <CardText>{card.german_text}</CardText>
                                            <CardText className="text-muted">{card.swahili_text}</CardText>
                                        </div>
                                    ) : (
                                        <div className="text-sm font-medium min-w-0">
                                            <CardText>{card.german_text} — {card.swahili_text}</CardText>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {(card.groups ?? []).length > 0 ? (
                                (() => {
                                    const badgeSummary = visibleBadgeSummary(card.groups ?? [], 2);
                                    return (
                                        <div className="mt-2 flex flex-wrap items-center gap-1">
                                            {badgeSummary.visible.map((group) => <GroupBadge key={String(group.id)} group={group} />)}
                                            {badgeSummary.overflow > 0 ? (
                                                <span className="rounded-full border border-soft px-2 py-1 text-[11px] text-muted">
                                                    +{badgeSummary.overflow}
                                                </span>
                                            ) : null}
                                        </div>
                                    );
                                })()
                            ) : <p className="mt-2 text-xs text-muted">Keine Gruppe</p>}

                            <div className="mt-2 flex items-center gap-2">
                                {card.image_path ? (
                                    <img
                                        src={`${imageBaseUrl}/${card.image_path}`}
                                        alt="Bild"
                                        className="w-12 h-12 object-cover rounded-lg border"
                                    />
                                ) : (
                                    <div className="w-12 h-12 rounded-lg border bg-surface" />
                                )}

                                {card.audio_path ? (
                                    <button
                                        type="button"
                                        className="rounded-lg border p-2 text-sm"
                                        onClick={() => onPlayAudio(card)}
                                        aria-label="Audio abspielen"
                                        title="Audio abspielen"
                                    >
                                        🔊
                                    </button>
                                ) : null}
                            </div>

                            <div className="mt-3 flex gap-2">
                                <button
                                    className="rounded-xl border px-3 py-2 text-sm"
                                    onClick={() => onEditCard(card)}
                                >
                                    Bearbeiten
                                </button>

                                <button
                                    className="rounded-xl border px-3 py-2 text-sm"
                                    onClick={() => onDeleteCard(String(card.id))}
                                    disabled={selectionMode}
                                >
                                    Löschen
                                </button>
                                <button
                                    className="rounded-xl border px-3 py-2 text-sm"
                                    onClick={() => onOpenCardGroupsEditor(card)}
                                    disabled={selectionMode}
                                >
                                    Gruppen bearbeiten
                                </button>
                            </div>
                        </div>
                    ))}

                    {filteredCardsCount === 0 ? (
                        <p className="text-sm text-muted">
                            {hasActiveGroupFilter ? "Keine Karten in den gewählten Gruppen. Wähle „Alle Karten“ oder passe den Filter an." : "Keine Treffer."}
                        </p>
                    ) : null}
                    {canLoadMore ? (
                        <button
                            type="button"
                            className="w-full rounded-xl border border-soft px-4 py-3 text-sm font-medium text-primary hover:bg-surface-elevated"
                            onClick={onLoadMore}
                        >
                            Mehr laden
                        </button>
                    ) : null}
                </div>
            </div>
        </FullScreenSheet>
    );
}
