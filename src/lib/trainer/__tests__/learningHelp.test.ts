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
    it("detects nouns from metadata", () => {
        const noun: TodayItemWithMeta = item({ nounClass: "ki/vi", plural: "vitabu" } as TodayItemWithMeta);
        expect(getLearningUnitType(noun)).toBe("noun");
    });

    it("detects verbs, greetings and pronouns", () => {
        expect(getLearningUnitType(item({ swahili_text: "kunywa", german_text: "trinken" }))).toBe("verb");
        expect(getLearningUnitType(item({ swahili_text: "habari za asubuhi", german_text: "Guten Morgen" }))).toBe("greeting");
        expect(getLearningUnitType(item({ swahili_text: "sisi", german_text: "wir" }))).toBe("pronoun");
    });

    it("detects adverbs/small words and phrases", () => {
        expect(getLearningUnitType(item({ swahili_text: "mbali", german_text: "weit" }))).toBe("adverb");
        expect(getLearningUnitType(item({ swahili_text: "ndiyo", german_text: "ja" }))).toBe("particle");
        expect(getLearningUnitType(item({ swahili_text: "chakula cha mchana", german_text: "Mittagessen" }))).toBe("phrase");
    });
});

describe("analysis target resolution", () => {
    it("returns a direct target for single words", () => {
        const resolved = resolveAnalysisTargetFromCard(item({ swahili_text: "kusoma" }));
        expect(resolved.needsSelection).toBe(false);
        expect(resolved.defaultTarget.value).toBe("kusoma");
    });

    it("returns selection options for phrase/sentence cards", () => {
        const resolved = resolveAnalysisTargetFromCard(item({ swahili_text: "habari za asubuhi" }));
        expect(resolved.needsSelection).toBe(true);
        expect(resolved.options[0].label).toContain("Ausdruck");
        expect(resolved.options.some((entry) => entry.label.includes("habari"))).toBe(true);
    });
});

describe("didactic templates", () => {
    it("builds noun template", () => {
        const nounCard: TodayItemWithMeta = item({ swahili_text: "kitabu", nounClass: "ki/vi", plural: "vitabu", singular: "kitabu" } as TodayItemWithMeta);
        const analysis = buildLearningAnalysis(nounCard, { kind: "whole", value: "kitabu", label: "Wort analysieren" });
        expect(analysis.type).toBe("noun");
        expect(analysis.sections.some((s) => s.title === "Form & Struktur")).toBe(true);
    });

    it("builds verb template", () => {
        const analysis = buildLearningAnalysis(item({ swahili_text: "kunywa", german_text: "trinken" }), { kind: "whole", value: "kunywa", label: "Wort analysieren" });
        expect(analysis.type).toBe("verb");
        expect(analysis.sections.some((s) => s.title === "Nützliche Formen")).toBe(true);
    });

    it("builds pronoun template", () => {
        const analysis = buildLearningAnalysis(item({ swahili_text: "sisi", german_text: "wir" }), { kind: "whole", value: "sisi", label: "Wort analysieren" });
        expect(analysis.type).toBe("pronoun");
        expect(analysis.sections.some((s) => s.title === "Funktion")).toBe(true);
    });

    it("builds greeting template", () => {
        const analysis = buildLearningAnalysis(item({ swahili_text: "pole", german_text: "Oh, das tut mir leid" }), { kind: "whole", value: "pole", label: "Wort analysieren" });
        expect(analysis.type).toBe("greeting");
        expect(analysis.sections.some((s) => s.title === "Kommunikative Funktion")).toBe(true);
    });

    it("builds adverb/small-word template", () => {
        const analysis = buildLearningAnalysis(item({ swahili_text: "mbali", german_text: "weit" }), { kind: "whole", value: "mbali", label: "Wort analysieren" });
        expect(analysis.type).toBe("adverb");
        expect(analysis.sections.some((s) => s.title === "Typische Chunks")).toBe(true);
    });
});

describe("fallback and caching", () => {
    it("caches analyses and reuses existing value", () => {
        const cache = new Map();
        const card = item({ id: "cache-1", swahili_text: "kusoma", german_text: "lesen" });
        const target = { kind: "whole", value: "kusoma", label: "Wort analysieren" } as const;

        const first = getOrCreateAnalysisMeta(cache, card, target);
        const second = getOrCreateAnalysisMeta(cache, card, target);

        expect(first).toBe(second);
        expect(cache.size).toBe(1);
    });

    it("provides graceful unknown fallback", () => {
        const analysis = buildLearningAnalysis(item({ swahili_text: "xyz", german_text: "unbekannt" }), { kind: "whole", value: "xyz", label: "Wort analysieren" });
        expect(analysis.type).toBe("unknown");
        expect(analysis.fallback).toBe(true);
        expect(analysis.sections.length).toBeGreaterThan(0);
    });
});

describe("global floating overlays safety", () => {
    it("keeps global AI/search overlay wiring unchanged", () => {
        const root = process.cwd();
        const overlaysPath = path.join(root, "src/components/GlobalOverlays.tsx");
        const source = fs.readFileSync(overlaysPath, "utf8");

        expect(source).toContain("GlobalAiChat");
        expect(source).toContain("GlobalQuickSearch");
        expect(source).toContain('aria-label="KI öffnen"');
        expect(source).toContain('aria-label="Suche öffnen"');
    });
});
