import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TrainerCardLibrarySheet from "@/components/trainer/TrainerCardLibrarySheet";

const baseProps = {
    open: true,
    title: "Meine Karten",
    cardsLoadState: "loaded" as const,
    cardsLoadError: null,
    status: "",
    groups: [{ id: "g1", name: "Alltag", owner_key: "owner", color: null }],
    isSentenceTrainer: false,
    imageBaseUrl: "https://example.test/images",
    selectionMode: false,
    selectedIds: new Set<string>(),
    selectedTotalCount: 0,
    countLabel: "2 von 3 Karten angezeigt",
    groupFilter: [],
    hasActiveGroupFilter: false,
    visibleCards: [
        { id: "1", german_text: "bitte", swahili_text: "tafadhali", groups: [{ id: "g1", name: "Alltag", color: null }] },
        { id: "2", german_text: "danke", swahili_text: "asante", image_path: "card.png", audio_path: "card.mp3", groups: [] },
    ],
    filteredCardsCount: 3,
    canLoadMore: true,
    onClose: vi.fn(),
    onRetryLoad: vi.fn(),
    onSelectionModeChange: vi.fn(),
    onSelectVisible: vi.fn(),
    onClearSelection: vi.fn(),
    onDeleteSelected: vi.fn(),
    onGroupFilterChange: vi.fn(),
    onOpenDuplicateReview: vi.fn(),
    onOpenManageGroups: vi.fn(),
    onLoadMore: vi.fn(),
    onToggleSelected: vi.fn(),
    onPlayAudio: vi.fn(),
    onEditCard: vi.fn(),
    onDeleteCard: vi.fn(),
    onOpenCardGroupsEditor: vi.fn(),
};

describe("TrainerCardLibrarySheet", () => {
    it("renders visible cards, count label, load more, and duplicate review entry", () => {
        const html = renderToStaticMarkup(<TrainerCardLibrarySheet {...baseProps} />);

        expect(html).toContain("Meine Karten");
        expect(html).toContain("2 von 3 Karten angezeigt");
        expect(html).toContain("bitte");
        expect(html).toContain("tafadhali");
        expect(html).toContain("danke");
        expect(html).toContain("Mehr laden");
        expect(html).toContain("Dubletten prüfen");
        expect(html).toContain("Gruppen verwalten");
        expect(html).toContain("Audio abspielen");
    });

    it("renders the filtered empty state", () => {
        const html = renderToStaticMarkup(
            <TrainerCardLibrarySheet
                {...baseProps}
                visibleCards={[]}
                filteredCardsCount={0}
                canLoadMore={false}
                hasActiveGroupFilter
                groupFilter={["g1"]}
                countLabel="0 von 0 passenden Karten angezeigt"
            />,
        );

        expect(html).toContain("0 von 0 passenden Karten angezeigt");
        expect(html).toContain("Keine Karten in den gewählten Gruppen");
        expect(html).not.toContain("Mehr laden");
    });

    it("renders manual visible-selection controls in selection mode", () => {
        const html = renderToStaticMarkup(
            <TrainerCardLibrarySheet
                {...baseProps}
                selectionMode
                selectedIds={new Set(["1"])}
                selectedTotalCount={1}
            />,
        );

        expect(html).toContain("1 Karte(n) ausgewählt");
        expect(html).toContain("Sichtbare auswählen");
        expect(html).toContain("Ausgewählte löschen");
        expect(html).toContain("Karte auswählen");
    });
});
