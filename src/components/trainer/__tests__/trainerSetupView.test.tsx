import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import TrainerSetupView from "@/components/trainer/TrainerSetupView";

const baseProps = {
    recommendation: "Heute fällig: 3 Karten",
    setupCountsLoading: false,
    setupCounts: { todayDue: 3, lastMissedCount: 1 },
    selectedPreset: "today" as const,
    allCardsCount: 10,
    allGroupRefinementOpen: false,
    trainingMaterial: { kind: "ALL" } as const,
    activeTrainerGroupName: null,
    groups: [{ id: "g1", name: "Gruppe 1", owner_key: "x" }],
    directionMode: "RANDOM" as const,
    directionHighlight: false,
    startDisabled: false,
    selectedPresetSummary: "Heute lernen",
    selectedPresetCount: 3,
    startHint: null,
    learnLoadError: null,
    onSelectPreset: vi.fn(),
    onToggleAllGroupRefinementOpen: vi.fn(),
    onTrainingMaterialChange: vi.fn(),
    onOpenManageGroups: vi.fn(),
    onDirectionModeChange: vi.fn(),
    onStart: vi.fn(),
    directionRef: { current: null },
    materialRef: { current: null },
};

describe("TrainerSetupView", () => {
    it("renders preset cards, single start CTA and direction selection", () => {
        const html = renderToStaticMarkup(<TrainerSetupView {...baseProps} />);
        expect(html).toContain("Heute lernen");
        expect(html).toContain("Alle Karten üben");
        expect(html).toContain("Zuletzt nicht gewusst");
        expect((html.match(/Session starten ·/g) ?? []).length).toBe(1);
        expect(html).toContain("Abfragerichtung");
    });

    it("renders group refinement only for all-cards preset", () => {
        const htmlToday = renderToStaticMarkup(<TrainerSetupView {...baseProps} />);
        expect(htmlToday).not.toContain("Trainingsmaterial:");

        const htmlAll = renderToStaticMarkup(
            <TrainerSetupView
                {...baseProps}
                selectedPreset="all"
                allGroupRefinementOpen
            />,
        );
        expect(htmlAll).toContain("Trainingsmaterial:");
    });
});
