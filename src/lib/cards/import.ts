export type MappingMode = "DE_LEFT_SW_RIGHT" | "SW_LEFT_DE_RIGHT";

export type ExistingCard = {
    id: string;
    german_text: string | null;
    swahili_text: string | null;
    type?: string | null;
};

export type ParsedImportRow = {
    lineNumber: number;
    rawLine: string;
    german: string;
    swahili: string;
    germanNormalized: string;
    swahiliNormalized: string;
};

export type InvalidImportRow = {
    lineNumber: number;
    rawLine: string;
    reason: string;
};

export type ImportClassification = {
    newRows: ParsedImportRow[];
    exactDuplicates: ParsedImportRow[];
    conflicts: Array<ParsedImportRow & { conflictType: "GERMAN_EXISTS" | "SWAHILI_EXISTS" | "BOTH" }>;
    invalidRows: InvalidImportRow[];
    counts: {
        totalLines: number;
        parsedValid: number;
        new: number;
        duplicates: number;
        conflicts: number;
        invalid: number;
    };
};

const MAX_SIDE_LENGTH = 120;
const MAX_LINE_LENGTH = 400;

export function normalizeImportValue(value: string): string {
    const trimmed = value.trim();
    const dequoted = trimmed
        .replace(/^['"“”‘’]+/, "")
        .replace(/['"“”‘’]+$/, "");

    return dequoted.replace(/\s+/g, " ").toLowerCase();
}

function cleanForStorage(value: string): string {
    const trimmed = value.trim();
    const dequoted = trimmed
        .replace(/^['"“”‘’]+/, "")
        .replace(/['"“”‘’]+$/, "");

    return dequoted.replace(/\s+/g, " ");
}

function splitLine(line: string): [string, string] | null {
    const normalizedDashes = line.replace(/[–—−]/g, "-");

    if (normalizedDashes.includes("\t")) {
        const parts = normalizedDashes.split("\t").map((part) => part.trim()).filter(Boolean);
        return parts.length === 2 ? [parts[0], parts[1]] : null;
    }

    for (const separator of [";", "="]) {
        const parts = normalizedDashes.split(separator).map((part) => part.trim());
        if (parts.length === 2) return [parts[0], parts[1]];
    }

    const dashParts = normalizedDashes.split(/\s-\s/).map((part) => part.trim());
    if (dashParts.length === 2) return [dashParts[0], dashParts[1]];

    return null;
}

function isLikelyJunk(value: string): boolean {
    if (!value.trim()) return true;
    if (/^[\p{P}\s]+$/u.test(value)) return true;
    if (/(.)\1{7,}/u.test(value)) return true;
    return false;
}

function isHeaderRow(left: string, right: string): boolean {
    const l = normalizeImportValue(left);
    const r = normalizeImportValue(right);
    const headers = new Set(["german", "deutsch", "swahili", "kiswahili"]);
    return headers.has(l) && headers.has(r) && l !== r;
}

export function parseImportText(rawText: string, mappingMode: MappingMode): { validRows: ParsedImportRow[]; invalidRows: InvalidImportRow[]; totalLines: number } {
    const lines = rawText.split(/\r?\n/);
    const validRows: ParsedImportRow[] = [];
    const invalidRows: InvalidImportRow[] = [];

    lines.forEach((line, index) => {
        const rawLine = line;
        const trimmedLine = rawLine.trim();
        if (!trimmedLine) return;

        if (trimmedLine.length > MAX_LINE_LENGTH) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Zeile ist zu lang." });
            return;
        }

        const split = splitLine(trimmedLine);
        if (!split) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Kein gültiges Trennzeichen gefunden." });
            return;
        }

        const [left, right] = split;
        if (isHeaderRow(left, right)) return;

        const german = mappingMode === "DE_LEFT_SW_RIGHT" ? cleanForStorage(left) : cleanForStorage(right);
        const swahili = mappingMode === "DE_LEFT_SW_RIGHT" ? cleanForStorage(right) : cleanForStorage(left);

        const germanNormalized = normalizeImportValue(german);
        const swahiliNormalized = normalizeImportValue(swahili);

        if (!germanNormalized || !swahiliNormalized) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Eine Seite ist leer." });
            return;
        }

        if (germanNormalized.length > MAX_SIDE_LENGTH || swahiliNormalized.length > MAX_SIDE_LENGTH) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Ein Wert ist zu lang." });
            return;
        }

        if (germanNormalized === swahiliNormalized) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Deutsch und Swahili sind identisch." });
            return;
        }

        if (isLikelyJunk(german) || isLikelyJunk(swahili)) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Zeile wirkt ungültig oder enthält nur Zeichenmüll." });
            return;
        }

        validRows.push({
            lineNumber: index + 1,
            rawLine,
            german,
            swahili,
            germanNormalized,
            swahiliNormalized,
        });
    });

    return { validRows, invalidRows, totalLines: lines.length };
}

export function classifyImportRows(rows: ParsedImportRow[], existingCards: ExistingCard[], initialInvalidRows: InvalidImportRow[] = [], totalLines: number = rows.length): ImportClassification {
    const exactPairs = new Set<string>();
    const germanToSw = new Map<string, Set<string>>();
    const swToGerman = new Map<string, Set<string>>();

    for (const card of existingCards) {
        const germanNorm = normalizeImportValue(card.german_text ?? "");
        const swNorm = normalizeImportValue(card.swahili_text ?? "");
        if (!germanNorm || !swNorm) continue;

        exactPairs.add(`${germanNorm}::${swNorm}`);

        if (!germanToSw.has(germanNorm)) germanToSw.set(germanNorm, new Set());
        germanToSw.get(germanNorm)?.add(swNorm);

        if (!swToGerman.has(swNorm)) swToGerman.set(swNorm, new Set());
        swToGerman.get(swNorm)?.add(germanNorm);
    }

    const seenInImport = new Set<string>();
    const newRows: ParsedImportRow[] = [];
    const exactDuplicates: ParsedImportRow[] = [];
    const conflicts: Array<ParsedImportRow & { conflictType: "GERMAN_EXISTS" | "SWAHILI_EXISTS" | "BOTH" }> = [];
    const invalidRows = [...initialInvalidRows];

    for (const row of rows) {
        const key = `${row.germanNormalized}::${row.swahiliNormalized}`;
        if (seenInImport.has(key)) {
            invalidRows.push({
                lineNumber: row.lineNumber,
                rawLine: row.rawLine,
                reason: "Doppelte Zeile innerhalb des Imports.",
            });
            continue;
        }
        seenInImport.add(key);

        if (exactPairs.has(key)) {
            exactDuplicates.push(row);
            continue;
        }

        const germanMatches = germanToSw.get(row.germanNormalized);
        const swMatches = swToGerman.get(row.swahiliNormalized);

        const germanConflict = Boolean(germanMatches && !germanMatches.has(row.swahiliNormalized));
        const swahiliConflict = Boolean(swMatches && !swMatches.has(row.germanNormalized));

        if (germanConflict || swahiliConflict) {
            conflicts.push({
                ...row,
                conflictType: germanConflict && swahiliConflict ? "BOTH" : germanConflict ? "GERMAN_EXISTS" : "SWAHILI_EXISTS",
            });
            continue;
        }

        newRows.push(row);
    }

    return {
        newRows,
        exactDuplicates,
        conflicts,
        invalidRows,
        counts: {
            totalLines,
            parsedValid: rows.length,
            new: newRows.length,
            duplicates: exactDuplicates.length,
            conflicts: conflicts.length,
            invalid: invalidRows.length,
        },
    };
}
