import { describe, expect, it } from "vitest";
import { classifyImportRows, normalizeImportValue, parseImportText } from "./import";

describe("import helpers", () => {
    it("normalizes values with typographic quotes and whitespace", () => {
        expect(normalizeImportValue("  Guten   Morgen ")).toBe("guten morgen");
        expect(normalizeImportValue(" 'mbwa' ")).toBe("mbwa");
        expect(normalizeImportValue("„Banane“")).toBe("banane");
    });

    it("cleans numbering, bullets and quotes while parsing", () => {
        const input = [
            "1. \"Hund\" = mbwa",
            "2) • „Katze“ = paka",
            "3 - * Buch = kitabu",
        ].join("\n");

        const parsed = parseImportText(input);

        expect(parsed.invalidRows).toHaveLength(0);
        expect(parsed.validRows).toHaveLength(3);
        expect(parsed.validRows[0].leftValue).toBe("Hund");
        expect(parsed.validRows[1].leftValue).toBe("Katze");
        expect(parsed.validRows[2].leftValue).toBe("Buch");
    });

    it("rejects separator-only rows and keeps real pairs", () => {
        const parsed = parseImportText("---\n;\nHaus = nyumba");

        expect(parsed.validRows).toHaveLength(1);
        expect(parsed.invalidRows.length).toBeGreaterThanOrEqual(2);
    });

    it("auto-detects direction for both Hund=mbwa and mbwa=Hund", () => {
        const parsed = parseImportText(["Hund = mbwa", "mbwa = Hund"].join("\n"));
        const result = classifyImportRows(parsed.validRows, [], "AUTO");

        expect(result.newRows).toHaveLength(1);
        expect(result.newRows[0].german).toBe("Hund");
        expect(result.newRows[0].swahili).toBe("mbwa");
        expect(result.invalidRows).toHaveLength(1);
    });

    it("supports mixed direction lists in auto mode", () => {
        const parsed = parseImportText(["Hund = mbwa", "paka = Katze", "Wasser = maji"].join("\n"));
        const result = classifyImportRows(parsed.validRows, [], "AUTO");

        expect(result.newRows).toHaveLength(2);
        expect(result.ambiguousRows).toHaveLength(1);
        expect(result.newRows.map((row) => `${row.german}:${row.swahili}`)).toEqual([
            "Hund:mbwa",
            "Katze:paka",
        ]);
    });

    it("marks ambiguous direction rows for review", () => {
        const parsed = parseImportText("radio = banana");
        const result = classifyImportRows(parsed.validRows, [], "AUTO");

        expect(result.ambiguousRows).toHaveLength(1);
        expect(result.newRows).toHaveLength(0);
    });

    it("classifies duplicates, conflicts and new rows after normalization", () => {
        const parsed = parseImportText([
            "1. Hund = mbwa",
            "• Katze = paka",
            "mbwa = Hund",
            "Katze = kitteh",
            "Vogel = ndege",
        ].join("\n"));

        const result = classifyImportRows(parsed.validRows, [
            { id: "1", german_text: "Hund", swahili_text: "mbwa", type: "vocab" },
            { id: "2", german_text: "Katze", swahili_text: "kitten", type: "vocab" },
        ], "AUTO");

        expect(result.exactDuplicates).toHaveLength(1);
        expect(result.conflicts).toHaveLength(2);
        expect(result.newRows).toHaveLength(0);
        expect(result.counts.new).toBe(0);
        expect(result.counts.duplicates).toBe(1);
        expect(result.counts.conflicts).toBe(2);
    });

    it("preview-like counts include invalid and ambiguous rows", () => {
        const parsed = parseImportText("Haus = nyumba\n???\nradio = banana\nBaum = mti");
        const result = classifyImportRows(parsed.validRows, [], "AUTO", parsed.invalidRows, parsed.totalLines);

        expect(result.counts.totalLines).toBe(4);
        expect(result.counts.invalid).toBe(1);
        expect(result.counts.ambiguous).toBe(1);
        expect(result.counts.new).toBe(2);
    });

    it("has zero importable rows when only duplicates/conflicts exist", () => {
        const parsed = parseImportText("Hund = mbwa\nKatze = kitteh");
        const result = classifyImportRows(parsed.validRows, [
            { id: "1", german_text: "Hund", swahili_text: "mbwa" },
            { id: "2", german_text: "Katze", swahili_text: "paka" },
        ], "AUTO");

        expect(result.counts.new).toBe(0);
        expect(result.counts.duplicates).toBe(1);
        expect(result.counts.conflicts).toBe(1);
    });
});
