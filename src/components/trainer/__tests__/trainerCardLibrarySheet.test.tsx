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
    onCreateSentence: vi.fn(),
};

describe("TrainerCardLibrarySheet", () => {
    it("renders visible cards, count label, load more, and duplicate review entry", () => {
        const html = renderToStaticMarkup(<TrainerCardLibrarySheet {...baseProps} />);

        expect(html).toContain("Meine Karten");
        expect(html).toContain("2 von 3 Karten angezeigt");
        expect(html).toContain("bitte");
        expect(html).toContain("tafadhali");
        expect(html).toContain("danke");
        expect(html).toContain("Mehr Wörter laden");
        expect(html).toContain("Dubletten prüfen");
        expect(html).toContain("Gruppen verwalten");
        expect(html).toContain('aria-label="Aussprache vorhanden, abspielen"');
        expect(html).toContain("Aktionen für bitte");
    });

    it("keeps sentence group selection in the card form and group maintenance central", () => {
        const html = renderToStaticMarkup(<TrainerCardLibrarySheet {...baseProps} isSentenceTrainer />);
        expect(html).toContain("Gruppen verwalten");
        expect(html).toContain("Satz bearbeiten");
        expect(html).not.toContain("Gruppen bearbeiten");
        expect(html).toContain('data-testid="sentence-library"');
        expect(html).toContain("Deine Lernsammlung");
        expect(html).toContain("Mehrfachauswahl");
        expect(html).toContain("Alle Gruppen");
    });

    it("shows sentence cards with positive metadata, group color, and one action menu", () => {
        const html = renderToStaticMarkup(<TrainerCardLibrarySheet {...baseProps}
            isSentenceTrainer title="Meine Sätze" filteredCardsCount={1} visibleCards={[{
                id: "s1", german_text: "Guten Morgen", swahili_text: "Habari za asubuhi",
                groups: [{ id: "g1", name: "Alltag", color: "sage" }],
                sentence_explanation: { version: 1 }, audio_path: "hello.mp3", image_path: "hello.png",
            }]}
        />);
        expect(html).toContain("Meine Sätze");
        expect(html).toContain("1 Satz");
        expect(html).toContain("Guten Morgen");
        expect(html).toContain("Habari za asubuhi");
        expect(html).toContain('aria-label="Gruppe vorhanden"');
        expect(html).toContain('aria-label="Lernerklärung vorhanden"');
        expect(html).not.toMatch(/>Lernerklärung vorhanden</);
        expect(html).toContain('aria-label="Aussprache vorhanden, abspielen"');
        expect(html).toContain('aria-label="Illustration vorhanden"');
        expect(html).toContain('aria-label="Aktionen für Guten Morgen"');
        expect(html).toContain('aria-controls="sentence-library-actions-s1"');
        expect(html).not.toContain("Keine Gruppe");
    });

    it("renders selection and filter feedback without changing the sentence pair", () => {
        const html = renderToStaticMarkup(<TrainerCardLibrarySheet {...baseProps}
            isSentenceTrainer selectionMode selectedIds={new Set(["1"])} selectedTotalCount={1}
            groupFilter={["g1"]} hasActiveGroupFilter
        />);
        expect(html).toContain("Gruppe: Alltag");
        expect(html).toContain("Filter zurücksetzen");
        expect(html).toContain("1 ausgewählt");
        expect(html).toContain('data-selected="true"');
        expect(html).toContain("Sichtbare auswählen");
        expect(html).toContain("Ausgewählte löschen");
        expect(html).not.toContain('aria-label="Aktionen für bitte"');
    });

    it("gives empty, loading and error sentence states their own feedback", () => {
        const empty = renderToStaticMarkup(<TrainerCardLibrarySheet {...baseProps}
            isSentenceTrainer visibleCards={[]} filteredCardsCount={0} canLoadMore={false}
        />);
        expect(empty).toContain("Noch keine Sätze");
        expect(empty).toContain("Ersten Satz anlegen");
        const loading = renderToStaticMarkup(<TrainerCardLibrarySheet {...baseProps}
            isSentenceTrainer cardsLoadState="loading" visibleCards={[]}
        />);
        expect(loading).toContain('aria-busy="true"');
        const error = renderToStaticMarkup(<TrainerCardLibrarySheet {...baseProps}
            isSentenceTrainer cardsLoadState="error" cardsLoadError="Verbindung fehlgeschlagen" visibleCards={[]}
        />);
        expect(error).toContain("Erneut laden");
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

        expect(html).toContain("Wörter in dieser Gruppe nicht gefunden");
        expect(html).toContain("Filter zurücksetzen");
        expect(html).not.toContain("Mehr Wörter laden");
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

        expect(html).toContain("1 ausgewählt");
        expect(html).toContain("Sichtbare auswählen");
        expect(html).toContain("Ausgewählte löschen");
        expect(html).toContain("Wort auswählen");
    });

    it("shows a compact thumbnail and only positive word metadata", () => {
        const html = renderToStaticMarkup(<TrainerCardLibrarySheet {...baseProps} visibleCards={[{
            id: "v1", german_text: "Katze", swahili_text: "paka", image_path: "cat.webp", audio_path: "cat.mp3",
            german_example: "Die Katze schläft.", has_note: true, groups: [{ id: "g1", name: "Alltag", color: "sage" }],
        }]} filteredCardsCount={1} canLoadMore={false} />);
        expect(html).toContain("word-library-thumb");
        expect(html).toContain('aria-label="Gruppe vorhanden"');
        expect(html).toContain('aria-label="Aussprache vorhanden, abspielen"');
        expect(html).not.toContain(">Beispiele</span>");
        expect(html).toContain("Notiz");
        expect(html).not.toContain("Kein Bild");
        expect(html).not.toContain(">Bild</span>");
    });
});
