import { describe, expect, it } from "vitest";
import { classifyImportRows, normalizeImportValue, parseImportText } from "./import";

describe("import helpers", () => {
    it("normalizes values for comparison", () => {
        expect(normalizeImportValue("  Guten   Morgen ")).toBe("guten morgen");
        expect(normalizeImportValue(" 'mbwa' ")).toBe("mbwa");
    });

    it("parses supported line formats", () => {
        const input = [
            "Hund; mbwa",
            "Katze = paka",
            "Maus - panya",
            "Auto\tgari",
        ].join("\n");

        const parsed = parseImportText(input, "DE_LEFT_SW_RIGHT");

        expect(parsed.invalidRows).toHaveLength(0);
        expect(parsed.validRows).toHaveLength(4);
        expect(parsed.validRows[0].german).toBe("Hund");
        expect(parsed.validRows[0].swahili).toBe("mbwa");
    });

    it("handles mapping mode correctly", () => {
        const parsed = parseImportText("mbwa - Hund", "SW_LEFT_DE_RIGHT");

        expect(parsed.validRows).toHaveLength(1);
        expect(parsed.validRows[0].german).toBe("Hund");
        expect(parsed.validRows[0].swahili).toBe("mbwa");
    });

    it("detects invalid lines", () => {
        const parsed = parseImportText("---\nDeutsch - Deutsch\nHallo -", "DE_LEFT_SW_RIGHT");

        expect(parsed.invalidRows.length).toBeGreaterThanOrEqual(2);
    });

    it("classifies duplicates, conflicts and new rows", () => {
        const parsed = parseImportText(
            ["Hund; mbwa", "Katze; paka", "Vogel; ndege", "Hund; doggo"].join("\n"),
            "DE_LEFT_SW_RIGHT"
        );

        const result = classifyImportRows(parsed.validRows, [
            { id: "1", german_text: "Hund", swahili_text: "mbwa", type: "vocab" },
            { id: "2", german_text: "Katze", swahili_text: "kitten", type: "vocab" },
        ]);

        expect(result.exactDuplicates).toHaveLength(1);
        expect(result.conflicts).toHaveLength(2);
        expect(result.newRows).toHaveLength(1);
        expect(result.counts.new).toBe(1);
        expect(result.counts.duplicates).toBe(1);
        expect(result.counts.conflicts).toBe(2);
    });

    it("marks repeated rows in same import as invalid", () => {
        const parsed = parseImportText("Haus; nyumba\nHaus; nyumba", "DE_LEFT_SW_RIGHT");
        const result = classifyImportRows(parsed.validRows, []);

        expect(result.newRows).toHaveLength(1);
        expect(result.invalidRows).toHaveLength(1);
    });

    it("preview-like counts include parse invalids", () => {
        const parsed = parseImportText("Haus; nyumba\n???\nBaum; mti", "DE_LEFT_SW_RIGHT");
        const result = classifyImportRows(parsed.validRows, [], parsed.invalidRows, parsed.totalLines);

        expect(result.counts.totalLines).toBe(3);
        expect(result.counts.invalid).toBe(1);
        expect(result.counts.new).toBe(2);
    });
});
