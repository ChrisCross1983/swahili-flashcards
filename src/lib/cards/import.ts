export type MappingMode = "AUTO" | "DE_LEFT_SW_RIGHT" | "SW_LEFT_DE_RIGHT";
export type ResolvedDirection = "DE_LEFT_SW_RIGHT" | "SW_LEFT_DE_RIGHT";

export type ExistingCard = {
    id: string;
    german_text: string | null;
    swahili_text: string | null;
    type?: string | null;
};

export type ParsedImportRow = {
    lineNumber: number;
    rawLine: string;
    leftValue: string;
    rightValue: string;
    leftNormalized: string;
    rightNormalized: string;
    german: string;
    swahili: string;
    germanNormalized: string;
    swahiliNormalized: string;
    resolvedDirection: ResolvedDirection;
    directionConfidence: "high" | "low";
};

export type InvalidImportRow = {
    lineNumber: number;
    rawLine: string;
    reason: string;
};

export type AmbiguousImportRow = {
    lineNumber: number;
    rawLine: string;
    leftValue: string;
    rightValue: string;
    reason: string;
};

export type ImportClassification = {
    newRows: ParsedImportRow[];
    exactDuplicates: ParsedImportRow[];
    conflicts: Array<ParsedImportRow & { conflictType: "GERMAN_EXISTS" | "SWAHILI_EXISTS" | "BOTH" }>;
    ambiguousRows: AmbiguousImportRow[];
    invalidRows: InvalidImportRow[];
    counts: {
        totalLines: number;
        parsedValid: number;
        new: number;
        duplicates: number;
        conflicts: number;
        ambiguous: number;
        invalid: number;
    };
};

const MAX_SIDE_LENGTH = 120;
const MAX_LINE_LENGTH = 400;
const OUTER_QUOTES = /['"“”‘’„‟‚‛«»‹›]+/g;

export function normalizeImportValue(value: string): string {
    const trimmed = stripOuterQuotes(value.trim());
    return trimmed.replace(/\s+/g, " ").toLowerCase();
}

function cleanForStorage(value: string): string {
    return stripOuterQuotes(value.trim()).replace(/\s+/g, " ");
}

function stripOuterQuotes(value: string): string {
    return value.replace(new RegExp(`^${OUTER_QUOTES.source}`), "").replace(new RegExp(`${OUTER_QUOTES.source}$`), "");
}

function sanitizeInputLine(value: string): string {
    let cleaned = value.replace(/[–—−]/g, "-").trim();

    let previous = "";
    while (cleaned && cleaned !== previous) {
        previous = cleaned;
        cleaned = cleaned
            .replace(/^\d+\s*[.)-]\s*/, "")
            .replace(/^[-*•●▪◦‣]+\s*/, "")
            .trim();
    }

    return cleaned.replace(/\s+/g, " ").trim();
}

function isSeparatorOnlyLine(value: string): boolean {
    return Boolean(value.trim()) && /^[\s;=\-–—−*•●▪◦‣]+$/u.test(value);
}

function splitLine(line: string): [string, string] | null {
    if (!line.trim()) return null;

    if (line.includes("\t")) {
        const parts = line.split("\t").map((part) => part.trim()).filter(Boolean);
        return parts.length === 2 ? [parts[0], parts[1]] : null;
    }

    for (const separator of [";", "="]) {
        const parts = line.split(separator).map((part) => part.trim());
        if (parts.length === 2) return [parts[0], parts[1]];
    }

    const dashParts = line.split(/\s-\s/).map((part) => part.trim());
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

function scoreGermanLike(value: string): number {
    const v = normalizeImportValue(value);
    let score = 0;
    if (/[äöüß]/u.test(v)) score += 3;
    if (/\b(der|die|das|ein|eine|nicht|und|mit|ich|du)\b/u.test(v)) score += 2;
    if (/(sch|ei|ie|ck|ung|chen)/u.test(v)) score += 1;
    if (/\b\w+en\b/u.test(v)) score += 0.5;
    return score;
}

function scoreSwahiliLike(value: string): number {
    const v = normalizeImportValue(value);
    let score = 0;
    if (/^(ki|vi|wa|ma|m|u|ku|pa|mw)/u.test(v)) score += 1;
    if (/(ng|ny|sh|ch|mw|dh|th)/u.test(v)) score += 1;
    if (/\b(ya|wa|kwa|katika|mimi|wewe|asante|karibu)\b/u.test(v)) score += 2;
    return score;
}

function buildDirectionRow(base: Omit<ParsedImportRow, "german" | "swahili" | "germanNormalized" | "swahiliNormalized" | "resolvedDirection" | "directionConfidence">, direction: ResolvedDirection, confidence: "high" | "low"): ParsedImportRow {
    const german = direction === "DE_LEFT_SW_RIGHT" ? base.leftValue : base.rightValue;
    const swahili = direction === "DE_LEFT_SW_RIGHT" ? base.rightValue : base.leftValue;

    return {
        ...base,
        german,
        swahili,
        germanNormalized: normalizeImportValue(german),
        swahiliNormalized: normalizeImportValue(swahili),
        resolvedDirection: direction,
        directionConfidence: confidence,
    };
}

function scoreDirectionCandidate(
    row: Omit<ParsedImportRow, "german" | "swahili" | "germanNormalized" | "swahiliNormalized" | "resolvedDirection" | "directionConfidence">,
    direction: ResolvedDirection,
    exactPairs: Set<string>,
    germanToSw: Map<string, Set<string>>,
    swToGerman: Map<string, Set<string>>
): number {
    const resolved = buildDirectionRow(row, direction, "low");
    const key = `${resolved.germanNormalized}::${resolved.swahiliNormalized}`;
    let score = 0;

    if (exactPairs.has(key)) score += 6;
    if (germanToSw.has(resolved.germanNormalized)) score += 3;
    if (swToGerman.has(resolved.swahiliNormalized)) score += 3;

    const germanMatches = germanToSw.get(resolved.germanNormalized);
    if (germanMatches && !germanMatches.has(resolved.swahiliNormalized)) score += 2;

    const swMatches = swToGerman.get(resolved.swahiliNormalized);
    if (swMatches && !swMatches.has(resolved.germanNormalized)) score += 2;

    score += (scoreGermanLike(resolved.german) - scoreSwahiliLike(resolved.german)) * 1.5;
    score += (scoreSwahiliLike(resolved.swahili) - scoreGermanLike(resolved.swahili)) * 1.5;

    return score;
}

function resolveDirection(
    row: Omit<ParsedImportRow, "german" | "swahili" | "germanNormalized" | "swahiliNormalized" | "resolvedDirection" | "directionConfidence">,
    mappingMode: MappingMode,
    exactPairs: Set<string>,
    germanToSw: Map<string, Set<string>>,
    swToGerman: Map<string, Set<string>>
): ParsedImportRow | AmbiguousImportRow {
    if (mappingMode === "DE_LEFT_SW_RIGHT") return buildDirectionRow(row, "DE_LEFT_SW_RIGHT", "high");
    if (mappingMode === "SW_LEFT_DE_RIGHT") return buildDirectionRow(row, "SW_LEFT_DE_RIGHT", "high");

    const leftAsGerman = scoreDirectionCandidate(row, "DE_LEFT_SW_RIGHT", exactPairs, germanToSw, swToGerman);
    const rightAsGerman = scoreDirectionCandidate(row, "SW_LEFT_DE_RIGHT", exactPairs, germanToSw, swToGerman);

    if (Math.abs(leftAsGerman - rightAsGerman) < 2) {
        return {
            lineNumber: row.lineNumber,
            rawLine: row.rawLine,
            leftValue: row.leftValue,
            rightValue: row.rightValue,
            reason: "Konnte die Sprachrichtung nicht sicher erkennen.",
        };
    }

    const direction: ResolvedDirection = leftAsGerman > rightAsGerman ? "DE_LEFT_SW_RIGHT" : "SW_LEFT_DE_RIGHT";
    return buildDirectionRow(row, direction, "high");
}

export function parseImportText(rawText: string): { validRows: Array<Omit<ParsedImportRow, "german" | "swahili" | "germanNormalized" | "swahiliNormalized" | "resolvedDirection" | "directionConfidence">>; invalidRows: InvalidImportRow[]; totalLines: number } {
    const lines = rawText.split(/\r?\n/);
    const validRows: Array<Omit<ParsedImportRow, "german" | "swahili" | "germanNormalized" | "swahiliNormalized" | "resolvedDirection" | "directionConfidence">> = [];
    const invalidRows: InvalidImportRow[] = [];

    lines.forEach((line, index) => {
        const rawLine = line;
        if (isSeparatorOnlyLine(rawLine)) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Zeile enthält nur Trennzeichen." });
            return;
        }

        const sanitizedLine = sanitizeInputLine(rawLine);
        if (!sanitizedLine) return;

        if (sanitizedLine.length > MAX_LINE_LENGTH) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Zeile ist zu lang." });
            return;
        }

        const split = splitLine(sanitizedLine);
        if (!split) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Kein gültiges Trennzeichen gefunden." });
            return;
        }

        const [leftRaw, rightRaw] = split;
        if (isHeaderRow(leftRaw, rightRaw)) return;

        const leftValue = cleanForStorage(leftRaw);
        const rightValue = cleanForStorage(rightRaw);
        const leftNormalized = normalizeImportValue(leftValue);
        const rightNormalized = normalizeImportValue(rightValue);

        if (!leftNormalized || !rightNormalized) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Eine Seite ist leer." });
            return;
        }

        if (leftNormalized.length > MAX_SIDE_LENGTH || rightNormalized.length > MAX_SIDE_LENGTH) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Ein Wert ist zu lang." });
            return;
        }

        if (leftNormalized === rightNormalized) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Deutsch und Swahili sind identisch." });
            return;
        }

        if (isLikelyJunk(leftValue) || isLikelyJunk(rightValue)) {
            invalidRows.push({ lineNumber: index + 1, rawLine, reason: "Zeile wirkt ungültig oder enthält nur Zeichenmüll." });
            return;
        }

        validRows.push({
            lineNumber: index + 1,
            rawLine,
            leftValue,
            rightValue,
            leftNormalized,
            rightNormalized,
        });
    });

    return { validRows, invalidRows, totalLines: lines.length };
}

export function classifyImportRows(
    rows: Array<Omit<ParsedImportRow, "german" | "swahili" | "germanNormalized" | "swahiliNormalized" | "resolvedDirection" | "directionConfidence">>,
    existingCards: ExistingCard[],
    mappingMode: MappingMode,
    initialInvalidRows: InvalidImportRow[] = [],
    totalLines: number = rows.length
): ImportClassification {
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
    const ambiguousRows: AmbiguousImportRow[] = [];
    const conflicts: Array<ParsedImportRow & { conflictType: "GERMAN_EXISTS" | "SWAHILI_EXISTS" | "BOTH" }> = [];
    const invalidRows = [...initialInvalidRows];

    for (const row of rows) {
        const resolved = resolveDirection(row, mappingMode, exactPairs, germanToSw, swToGerman);

        if (!("german" in resolved)) {
            ambiguousRows.push(resolved);
            continue;
        }

        const key = `${resolved.germanNormalized}::${resolved.swahiliNormalized}`;
        if (seenInImport.has(key)) {
            invalidRows.push({
                lineNumber: resolved.lineNumber,
                rawLine: resolved.rawLine,
                reason: "Doppelte Zeile innerhalb des Imports.",
            });
            continue;
        }
        seenInImport.add(key);

        if (exactPairs.has(key)) {
            exactDuplicates.push(resolved);
            continue;
        }

        const germanMatches = germanToSw.get(resolved.germanNormalized);
        const swMatches = swToGerman.get(resolved.swahiliNormalized);

        const germanConflict = Boolean(germanMatches && !germanMatches.has(resolved.swahiliNormalized));
        const swahiliConflict = Boolean(swMatches && !swMatches.has(resolved.germanNormalized));

        if (germanConflict || swahiliConflict) {
            conflicts.push({
                ...resolved,
                conflictType: germanConflict && swahiliConflict ? "BOTH" : germanConflict ? "GERMAN_EXISTS" : "SWAHILI_EXISTS",
            });
            continue;
        }

        newRows.push(resolved);
    }

    return {
        newRows,
        exactDuplicates,
        conflicts,
        invalidRows,
        ambiguousRows,
        counts: {
            totalLines,
            parsedValid: rows.length,
            new: newRows.length,
            duplicates: exactDuplicates.length,
            conflicts: conflicts.length,
            ambiguous: ambiguousRows.length,
            invalid: invalidRows.length,
        },
    };
}
