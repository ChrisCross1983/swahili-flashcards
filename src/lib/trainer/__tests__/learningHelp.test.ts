import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    buildLearningAnalysis,
    getLearningUnitType,
    getOrCreateAnalysisMeta,
    resolveAnalysisTargetFromCard,
} from "../learningHelp";
import type { TodayItem } from "../types";
type TodayItemWithMeta = TodayItem & { nounClass?: string; plural?: string; singular?: string };

function item(overrides: Partial<TodayItem> = {}): TodayItem {
    return {
        id: "c-1",
        level: 1,
        german_text: "Buch",
        swahili_text: "kitabu",
        ...overrides,
    };
}

describe("learning help type detection", () => {
    it("detects nouns from morphology metadata", () => {
        const noun: TodayItemWithMeta = item({ nounClass: "ki/vi", plural: "vitabu" } as TodayItemWithMeta);
        expect(getLearningUnitType(noun)).toBe("noun");
    });

    it("detects verbs from ku- base form", () => {
        expect(getLearningUnitType(item({ swahili_text: "kusoma", german_text: "lesen" }))).toBe("verb");
    });

    it("detects greetings", () => {
        expect(getLearningUnitType(item({ swahili_text: "habari za asubuhi", german_text: "Guten Morgen" }))).toBe("greeting");
    });

    it("detects phrases", () => {
        expect(getLearningUnitType(item({ swahili_text: "chakula cha mchana", german_text: "Mittagessen" }))).toBe("phrase");
    });

    it("detects sentences", () => {
        expect(getLearningUnitType(item({ swahili_text: "Ninasoma kitabu.", type: "sentence", german_text: "Ich lese ein Buch." }))).toBe("sentence");
    });
});

describe("analysis target resolution", () => {
    it("returns a direct target for single words", () => {
        const resolved = resolveAnalysisTargetFromCard(item({ swahili_text: "kusoma" }));
        expect(resolved.needsSelection).toBe(false);
        expect(resolved.defaultTarget.value).toBe("kusoma");
    });

    it("returns selection options for phrases and sentences", () => {
        const resolved = resolveAnalysisTargetFromCard(item({ swahili_text: "habari za asubuhi" }));
        expect(resolved.needsSelection).toBe(true);
        expect(resolved.options[0].label).toBe("Ganzen Ausdruck erklären");
        expect(resolved.options.some((entry) => entry.label.includes("habari"))).toBe(true);
        expect(resolved.options.some((entry) => entry.label.includes("asubuhi"))).toBe(true);
    });
});

describe("analysis data shapes", () => {
    it("builds noun analysis shape", () => {
        const nounCard: TodayItemWithMeta = item({
            swahili_text: "kitabu",
            nounClass: "ki/vi",
            plural: "vitabu",
            singular: "kitabu",
        } as TodayItemWithMeta);
        const analysis = buildLearningAnalysis(nounCard, { kind: "whole", value: "kitabu", label: "Wort analysieren" });

        expect(analysis.type).toBe("noun");
        expect(analysis.singular).toBe("kitabu");
        expect(analysis.plural).toBe("vitabu");
        expect(analysis.nounClass).toBe("ki/vi");
    });

    it("builds verb analysis shape", () => {
        const analysis = buildLearningAnalysis(item({ swahili_text: "kusoma", german_text: "lesen" }), { kind: "whole", value: "kusoma", label: "Wort analysieren" });

        expect(analysis.type).toBe("verb");
        expect(analysis.baseForm).toBe("kusoma");
        expect((analysis.forms ?? []).length).toBeGreaterThan(1);
    });

    it("builds phrase/greeting analysis shape", () => {
        const analysis = buildLearningAnalysis(item({ swahili_text: "habari za asubuhi", german_text: "Guten Morgen" }), { kind: "whole", value: "habari za asubuhi", label: "Ganzen Ausdruck erklären" });

        expect(["phrase", "greeting"]).toContain(analysis.type);
        expect(analysis.contextNote).toBeTruthy();
    });

    it("builds sentence analysis shape", () => {
        const analysis = buildLearningAnalysis(item({ swahili_text: "Ninasoma kitabu.", german_text: "Ich lese ein Buch.", type: "sentence" }), { kind: "sentence_structure", value: "Ninasoma kitabu.", label: "Satzstruktur erklären" });

        expect(analysis.type).toBe("sentence");
        expect(analysis.structuralExplanation).toBeTruthy();
        expect((analysis.highlightParts ?? []).length).toBeGreaterThan(0);
    });
});

describe("lazy analysis retrieval and fallbacks", () => {
    it("caches analyses and reuses existing value", () => {
        const cache = new Map();
        const card = item({ id: "cache-1", swahili_text: "kusoma", german_text: "lesen" });
        const target = { kind: "whole", value: "kusoma", label: "Wort analysieren" } as const;

        const first = getOrCreateAnalysisMeta(cache, card, target);
        const second = getOrCreateAnalysisMeta(cache, card, target);

        expect(first).toBe(second);
        expect(cache.size).toBe(1);
    });

    it("returns a safe fallback for unknown words", () => {
        const analysis = buildLearningAnalysis(item({ swahili_text: "xyz" }), { kind: "whole", value: "xyz", label: "Wort analysieren" });
        expect(analysis.type).toBe("unknown");
        expect(analysis.fallback).toBe(true);
    });
});

describe("global floating overlays safety", () => {
    it("keeps global AI/search overlay wiring unchanged", () => {
        const root = process.cwd();
        const overlaysPath = path.join(root, "src/components/GlobalOverlays.tsx");
        const source = fs.readFileSync(overlaysPath, "utf8");

        expect(source).toContain("GlobalAiChat");
        expect(source).toContain("GlobalQuickSearch");
        expect(source).toContain("aria-label=\"KI öffnen\"");
        expect(source).toContain("aria-label=\"Suche öffnen\"");
    });
});
