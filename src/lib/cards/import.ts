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
    directionExplanation?: string;
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
    directionExplanation?: string;
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
const COMMON_GERMAN_WORDS = new Set([
    "hund", "katze", "haus", "wasser", "buch", "auto", "banane", "freund", "tomate", "lehrer", "vogel",
]);
const COMMON_SWAHILI_WORDS = new Set([
    "mbwa", "paka", "nyumba", "maji", "kitabu", "gari", "ndizi", "rafiki", "nyanya", "mwalimu", "ndege",
]);

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
    if (!v) return score;

    if (/[äöüß]/u.test(v)) score += 3;
    if (/\b(der|die|das|ein|eine|einer|einem|nicht|und|mit|ich|du|wir|ihr|sie|ist|sind|sein)\b/u.test(v)) score += 2.5;
    if (/(sch|ei|ie|au|eu|äu|ck|tz|pf|sp|st|ung|chen|keit|heit|lich|ig)/u.test(v)) score += 1.2;
    if (/(tt|ll|nn|mm|ss)/u.test(v)) score += 0.4;
    if (/\b\w+(en|er|e|n)\b/u.test(v)) score += 0.4;
    if (/[^aeiouäöü\s]{3,}/u.test(v)) score += 0.5;
    if (COMMON_GERMAN_WORDS.has(v)) score += 2.5;

    if (/\b(ya|wa|kwa|katika|mimi|wewe|yeye|sisi|nyinyi|asante|karibu|sana)\b/u.test(v)) score -= 1.8;
    return score;
}

function scoreSwahiliLike(value: string): number {
    const v = normalizeImportValue(value);
    let score = 0;
    if (!v) return score;

    if (/^(ki|vi|wa|ma|mwa|mwi|m|u|ku|pa|tu|ny|nd|ng|ch|sh)/u.test(v)) score += 1.5;
    if (/(ng|ny|sh|ch|mw|dh|th|nd|mb|ngw)/u.test(v)) score += 1.2;
    if (/\b(ya|wa|kwa|katika|mimi|wewe|yeye|sisi|nyinyi|asante|karibu|sana|hii|hiyo)\b/u.test(v)) score += 2.5;
    if (/^[a-z]+$/u.test(v) && /[aeiou]$/u.test(v)) score += 0.5;
    if (/\b(ni|si|la|na|wa|za)\b/u.test(v)) score += 0.5;
    if (COMMON_SWAHILI_WORDS.has(v)) score += 2.5;

    if (/[äöüß]/u.test(v)) score -= 2;
    if (/\b(der|die|das|ein|eine|nicht|und|mit|ich|du|wir|ihr|sie)\b/u.test(v)) score -= 1.8;
    return score;
}

function isSimpleSingleWord(value: string): boolean {
    return /^[\p{L}]+$/u.test(normalizeImportValue(value));
}

function buildDirectionRow(
    base: Omit<ParsedImportRow, "german" | "swahili" | "germanNormalized" | "swahiliNormalized" | "resolvedDirection" | "directionConfidence">,
    direction: ResolvedDirection,
    confidence: "high" | "low",
    directionExplanation?: string
): ParsedImportRow {
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
        directionExplanation,
    };
}

type DirectionCandidateScore = {
    total: number;
    dbScore: number;
    lexicalScore: number;
    germanSideScore: number;
    swahiliSideScore: number;
    oppositePenalty: number;
};

function scoreDirectionCandidate(
    row: Omit<ParsedImportRow, "german" | "swahili" | "germanNormalized" | "swahiliNormalized" | "resolvedDirection" | "directionConfidence">,
    direction: ResolvedDirection,
    exactPairs: Set<string>,
    germanToSw: Map<string, Set<string>>,
    swToGerman: Map<string, Set<string>>
): DirectionCandidateScore {
    const resolved = buildDirectionRow(row, direction, "low");
    const key = `${resolved.germanNormalized}::${resolved.swahiliNormalized}`;
    let dbScore = 0;

    if (exactPairs.has(key)) dbScore += 8;
    if (germanToSw.has(resolved.germanNormalized)) dbScore += 2.5;
    if (swToGerman.has(resolved.swahiliNormalized)) dbScore += 2.5;

    const germanMatches = germanToSw.get(resolved.germanNormalized);
    if (germanMatches && !germanMatches.has(resolved.swahiliNormalized)) dbScore += 1.5;

    const swMatches = swToGerman.get(resolved.swahiliNormalized);
    if (swMatches && !swMatches.has(resolved.germanNormalized)) dbScore += 1.5;

    const germanSideScore = scoreGermanLike(resolved.german);
    const swahiliSideScore = scoreSwahiliLike(resolved.swahili);
    const oppositePenalty = (scoreSwahiliLike(resolved.german) + scoreGermanLike(resolved.swahili)) * 0.7;

    let lexicalScore = germanSideScore + swahiliSideScore - oppositePenalty;

    const leftSimple = isSimpleSingleWord(row.leftValue);
    const rightSimple = isSimpleSingleWord(row.rightValue);
    if (leftSimple && rightSimple) {
        const germanSideDelta = germanSideScore - scoreSwahiliLike(resolved.german);
        const swahiliSideDelta = swahiliSideScore - scoreGermanLike(resolved.swahili);
        if (germanSideDelta >= 1 && swahiliSideDelta >= 1) lexicalScore += 1.5;
    }

    return {
        total: dbScore + lexicalScore,
        dbScore,
        lexicalScore,
        germanSideScore,
        swahiliSideScore,
        oppositePenalty,
    };
}

function explainDirectionDecision(leftToRight: DirectionCandidateScore, rightToLeft: DirectionCandidateScore): string {
    return `DE→SW total=${leftToRight.total.toFixed(2)} (db=${leftToRight.dbScore.toFixed(2)}, lex=${leftToRight.lexicalScore.toFixed(2)}), SW→DE total=${rightToLeft.total.toFixed(2)} (db=${rightToLeft.dbScore.toFixed(2)}, lex=${rightToLeft.lexicalScore.toFixed(2)})`;
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
    const explanation = explainDirectionDecision(leftAsGerman, rightAsGerman);
    const scoreMargin = Math.abs(leftAsGerman.total - rightAsGerman.total);
    const winner = leftAsGerman.total > rightAsGerman.total ? leftAsGerman : rightAsGerman;

    const marginTooSmall = scoreMargin < 1.2;
    const confidenceTooLow = winner.total < 1.2;

    if (marginTooSmall || confidenceTooLow) {
        return {
            lineNumber: row.lineNumber,
            rawLine: row.rawLine,
            leftValue: row.leftValue,
            rightValue: row.rightValue,
            reason: "Konnte die Sprachrichtung nicht sicher erkennen.",
            directionExplanation: explanation,
        };
    }

    const direction: ResolvedDirection = leftAsGerman.total > rightAsGerman.total ? "DE_LEFT_SW_RIGHT" : "SW_LEFT_DE_RIGHT";
    const confidence: "high" | "low" = scoreMargin >= 2.8 && winner.total >= 3 ? "high" : "low";
    return buildDirectionRow(row, direction, confidence, explanation);
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
