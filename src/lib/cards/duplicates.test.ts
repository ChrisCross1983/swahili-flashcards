import { describe, expect, it } from "vitest";
import { detectDuplicateClusters, recommendKeepCard, validateClusterDeletionSelection, type DuplicateCard } from "./duplicates";

function card(overrides: Partial<DuplicateCard>): DuplicateCard {
    return {
        id: overrides.id ?? crypto.randomUUID(),
        german_text: overrides.german_text ?? "",
        swahili_text: overrides.swahili_text ?? "",
        created_at: overrides.created_at ?? null,
        image_path: overrides.image_path ?? null,
        audio_path: overrides.audio_path ?? null,
        progressLevel: overrides.progressLevel ?? 0,
        groupCount: overrides.groupCount ?? 0,
        type: "vocab",
    };
}

describe("duplicate detection", () => {
    it("detects exact duplicates", () => {
        const clusters = detectDuplicateClusters([
            card({ id: "1", german_text: "und", swahili_text: "na" }),
            card({ id: "2", german_text: "und", swahili_text: "na" }),
        ], "strict");

        expect(clusters).toHaveLength(1);
        expect(clusters[0].kind).toBe("exact");
        expect(clusters[0].mode).toBe("strict");
    });

    it("detects normalized duplicates with casing/whitespace differences", () => {
        const clusters = detectDuplicateClusters([
            card({ id: "1", german_text: "Guten Morgen", swahili_text: "habari za asubuhi" }),
            card({ id: "2", german_text: "  guten   morgen ", swahili_text: "habari za asubuhi" }),
        ], "strict");

        expect(clusters).toHaveLength(1);
        expect(clusters[0].kind).toBe("normalized");
    });

    it("detects direction-swapped duplicates", () => {
        const clusters = detectDuplicateClusters([
            card({ id: "1", german_text: "Hallo", swahili_text: "jambo" }),
            card({ id: "2", german_text: "jambo", swahili_text: "Hallo" }),
        ], "strict");

        expect(clusters).toHaveLength(1);
        expect(clusters[0].kind).toBe("direction_swapped");
    });

    it("detects suspicious phrase extension candidates", () => {
        const clusters = detectDuplicateClusters([
            card({ id: "1", german_text: "together", swahili_text: "pamoja" }),
            card({ id: "2", german_text: "together", swahili_text: "pamoja na" }),
        ], "review");

        expect(clusters).toHaveLength(1);
        expect(clusters[0].kind).toBe("suspicious");
        expect(clusters[0].mode).toBe("review");
    });

    it("does not flag unrelated pairs", () => {
        const clusters = detectDuplicateClusters([
            card({ id: "1", german_text: "Hund", swahili_text: "mbwa" }),
            card({ id: "2", german_text: "Katze", swahili_text: "paka" }),
        ], "all");

        expect(clusters).toHaveLength(0);
    });
});

describe("recommendation and deletion safety", () => {
    it("recommends keeping richer card", () => {
        const recommendation = recommendKeepCard([
            card({ id: "1", german_text: "und", swahili_text: "na", created_at: "2026-01-01T00:00:00.000Z" }),
            card({ id: "2", german_text: "und", swahili_text: "na", progressLevel: 3, groupCount: 2, image_path: "x.jpg" }),
        ]);

        expect(recommendation?.keepCardId).toBe("2");
        expect(recommendation?.reason).toContain("Lernfortschritt");
    });

    it("blocks deleting all cards in a cluster", () => {
        const cluster = detectDuplicateClusters([
            card({ id: "1", german_text: "und", swahili_text: "na" }),
            card({ id: "2", german_text: "und", swahili_text: "na" }),
        ], "strict")[0];

        expect(validateClusterDeletionSelection(cluster, ["1", "2"]))
            .toBe("Mindestens eine Karte muss pro Cluster behalten werden.");
        expect(validateClusterDeletionSelection(cluster, ["2"]))
            .toBeNull();
    });
});
