import { describe, expect, it } from "vitest";
import { buildEditablePreviewState, classifyImportRows, normalizeImportValue, parseImportText, revalidatePreviewRow } from "./import";

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

    it("parses tab-separated rows as valid pairs", () => {
        const parsed = parseImportText("Banane\tndizi");

        expect(parsed.invalidRows).toHaveLength(0);
        expect(parsed.validRows).toHaveLength(1);
        expect(parsed.validRows[0].leftValue).toBe("Banane");
        expect(parsed.validRows[0].rightValue).toBe("ndizi");
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
        expect(result.invalidRows[0].reason).toBe("Dieses Wortpaar ist in deiner Importliste bereits enthalten.");
    });

    it("resolves clean forward pairs confidently in auto mode", () => {
        const parsed = parseImportText([
            "Hund; mbwa",
            "Katze; paka",
            "Haus; nyumba",
            "Wasser; maji",
            "Buch; kitabu",
            "Auto; gari",
            "Banane; ndizi",
            "Freund; rafiki",
            "Tomate; nyanya",
            "Lehrer; mwalimu",
        ].join("\n"));
        const result = classifyImportRows(parsed.validRows, [], "AUTO");

        expect(result.ambiguousRows).toHaveLength(0);
        expect(result.newRows).toHaveLength(10);
        expect(result.newRows.every((row) => row.resolvedDirection === "DE_LEFT_SW_RIGHT")).toBe(true);
        expect(result.newRows.every((row) => row.directionExplanation?.includes("DE→SW total="))).toBe(true);
    });

    it("keeps clean DE→SW rows in forward direction in auto mode", () => {
        const parsed = parseImportText([
            "Mango; embe",
            "Banane; ndizi",
            "Freund; rafiki",
        ].join("\n"));
        const result = classifyImportRows(parsed.validRows, [], "DE_LEFT_SW_RIGHT");

        expect(result.ambiguousRows).toHaveLength(0);
        expect(result.newRows.map((row) => `${row.german}:${row.swahili}`)).toEqual([
            "Mango:embe",
            "Banane:ndizi",
            "Freund:rafiki",
        ]);
    });

    it("resolves clean reversed pairs in auto mode", () => {
        const parsed = parseImportText([
            "mbwa - Hund",
            "paka - Katze",
            "nyumba - Haus",
            "maji - Wasser",
            "kitabu - Buch",
            "gari - Auto",
        ].join("\n"));
        const result = classifyImportRows(parsed.validRows, [], "AUTO");

        expect(result.ambiguousRows).toHaveLength(0);
        expect(result.newRows).toHaveLength(6);
        expect(result.newRows.every((row) => row.resolvedDirection === "SW_LEFT_DE_RIGHT")).toBe(true);
    });

    it("supports mixed direction lists in auto mode", () => {
        const parsed = parseImportText(["Hund = mbwa", "paka = Katze", "Wasser = maji", "gari = Auto"].join("\n"));
        const result = classifyImportRows(parsed.validRows, [], "AUTO");

        expect(result.newRows).toHaveLength(4);
        expect(result.ambiguousRows).toHaveLength(0);
        expect(result.newRows.map((row) => `${row.german}:${row.swahili}`)).toEqual([
            "Hund:mbwa",
            "Katze:paka",
            "Wasser:maji",
            "Auto:gari",
        ]);
    });

    it("marks ambiguous direction rows for review", () => {
        const parsed = parseImportText("radio = banana");
        const result = classifyImportRows(parsed.validRows, [], "AUTO");

        expect(result.ambiguousRows).toHaveLength(1);
        expect(result.newRows).toHaveLength(0);
        expect(result.ambiguousRows[0].directionExplanation).toContain("DE→SW total=");
    });

    it("keeps truly weak rows ambiguous when confidence margin is small", () => {
        const parsed = parseImportText(["lala = lili", "mama = mamaa"].join("\n"));
        const result = classifyImportRows(parsed.validRows, [], "AUTO");

        expect(result.ambiguousRows).toHaveLength(2);
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
            { id: "3", german_text: "Vogel", swahili_text: "ndege", type: "vocab" },
        ], "AUTO");

        expect(result.exactDuplicates).toHaveLength(2);
        expect(result.conflicts).toHaveLength(2);
        expect(result.newRows).toHaveLength(0);
        expect(result.counts.new).toBe(0);
        expect(result.counts.duplicates).toBe(2);
        expect(result.counts.conflicts).toBe(2);
    });

    it("uses clearer messaging for same-import reverse duplicates when direction is fixed", () => {
        const parsed = parseImportText("Hund = mbwa\nmbwa = Hund");
        const result = classifyImportRows(parsed.validRows, [], "DE_LEFT_SW_RIGHT");

        expect(result.newRows).toHaveLength(1);
        expect(result.invalidRows).toHaveLength(1);
        expect(result.invalidRows[0].reason).toContain("umgekehrte Richtung");
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

    it("builds editable preview rows for conflicts, ambiguous and invalid rows", () => {
        const parsed = parseImportText("Katze = kitteh\nradio = banana\n???");
        const result = classifyImportRows(parsed.validRows, [{ id: "1", german_text: "Katze", swahili_text: "paka" }], "AUTO", parsed.invalidRows, parsed.totalLines);
        const editable = buildEditablePreviewState(result);

        expect(editable.some((row) => row.status === "conflict")).toBe(true);
        expect(editable.some((row) => row.status === "ambiguous")).toBe(true);
        expect(editable.some((row) => row.status === "invalid")).toBe(true);
    });

    it("revalidation can resolve ambiguous rows via direction swap", () => {
        const existing = [{ id: "1", german_text: "Hund", swahili_text: "mbwa" }];
        const updated = revalidatePreviewRow({
            lineNumber: 1,
            rawLine: "mbwa = Hund",
            german: "Hund",
            swahili: "mbwa",
            direction: "DE_LEFT_SW_RIGHT",
            selectedAction: "keep",
        }, existing);

        expect(updated.status).toBe("duplicate");
    });

    it("editing values can turn conflict-like rows into importable", () => {
        const existing = [{ id: "1", german_text: "Katze", swahili_text: "paka" }];
        const updated = revalidatePreviewRow({
            lineNumber: 2,
            rawLine: "Katze = kitteh",
            german: "Kätzchen",
            swahili: "kitteh",
            direction: "DE_LEFT_SW_RIGHT",
            selectedAction: "keep",
        }, existing);

        expect(updated.status).toBe("importable");
    });

    it("revalidation marks skipped rows as skipped", () => {
        const updated = revalidatePreviewRow({
            lineNumber: 3,
            rawLine: "radio = banana",
            german: "radio",
            swahili: "banana",
            direction: "DE_LEFT_SW_RIGHT",
            selectedAction: "skip",
        }, []);

        expect(updated.status).toBe("skipped");
    });

    it("conflict explanations detect likely alternative glosses", () => {
        const parsed = parseImportText("okay = sawa / sawa kabisa");
        const result = classifyImportRows(parsed.validRows, [{ id: "1", german_text: "okay", swahili_text: "sawa" }], "DE_LEFT_SW_RIGHT");

        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0].reasonType).toBe("ALTERNATIVE_GLOSS");
    });

    it("keeps slash and parenthetical gloss entries supported (not hard-invalid)", () => {
        const parsed = parseImportText("jener/jene (dort) = yule");
        const result = classifyImportRows(parsed.validRows, [], "AUTO");

        expect(result.invalidRows).toHaveLength(0);
        expect(result.newRows.length + result.ambiguousRows.length).toBe(1);
    });
});
