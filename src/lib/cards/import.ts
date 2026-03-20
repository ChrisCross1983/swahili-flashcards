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

export type ConflictReasonType = "GERMAN_SIDE_EXISTS" | "SWAHILI_SIDE_EXISTS" | "ALTERNATIVE_GLOSS" | "AMBIGUOUS_MAPPING";

export type ExistingMatchInfo = {
    id: string;
    german: string;
    swahili: string;
};

export type ConflictImportRow = ParsedImportRow & {
    conflictType: "GERMAN_EXISTS" | "SWAHILI_EXISTS" | "BOTH";
    reasonType: ConflictReasonType;
    reason: string;
    existingMatches: ExistingMatchInfo[];
};

export type ImportClassification = {
    newRows: ParsedImportRow[];
    exactDuplicates: ParsedImportRow[];
    conflicts: ConflictImportRow[];
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


export type EditablePreviewStatus = "importable" | "duplicate" | "conflict" | "ambiguous" | "invalid" | "skipped";

export type EditablePreviewRow = {
    rowKey: string;
    lineNumber: number;
    rawLine: string;
    originalGerman: string;
    originalSwahili: string;
    originalDirection: ResolvedDirection;
    german: string;
    swahili: string;
    direction: ResolvedDirection;
    status: EditablePreviewStatus;
    reason: string;
    directionExplanation?: string;
    reasonType?: ConflictReasonType;
    existingMatches?: ExistingMatchInfo[];
    selectedAction: "keep" | "skip";
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

    // Preserve tab separators so TAB-delimited rows still parse as valid pairs.
    return cleaned
        .replace(/[^\S\t]+/g, " ")
        .replace(/[^\S\t]*\t[^\S\t]*/g, "\t")
        .trim();
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

function startsUppercaseLetter(value: string): boolean {
    const trimmed = value.trim();
    return /^[A-ZÄÖÜ]/u.test(trimmed);
}

function startsLowercaseLetter(value: string): boolean {
    const trimmed = value.trim();
    return /^[a-zäöü]/u.test(trimmed);
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

        if (startsUppercaseLetter(resolved.german) && startsLowercaseLetter(resolved.swahili)) {
            lexicalScore += 1.5;
        }
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
    const STABLE_FORWARD_TOTAL = 1.2;
    const REVERSE_CLEAR_WIN_MARGIN = 3;
    const FORWARD_ORDER_BIAS = 1.4;
    const leftTotalWithBias = leftAsGerman.total + FORWARD_ORDER_BIAS;
    const rightTotalWithBias = rightAsGerman.total;
    const scoreMargin = Math.abs(leftTotalWithBias - rightTotalWithBias);
    const winner = leftTotalWithBias > rightTotalWithBias ? leftAsGerman : rightAsGerman;
    const looksLikeStableForwardPair =
        isSimpleSingleWord(row.leftValue) &&
        isSimpleSingleWord(row.rightValue) &&
        startsUppercaseLetter(row.leftValue) &&
        startsLowercaseLetter(row.rightValue);
    const canSafelyKeepForward =
        (leftAsGerman.total >= STABLE_FORWARD_TOTAL || looksLikeStableForwardPair) &&
        (rightTotalWithBias - leftTotalWithBias) < REVERSE_CLEAR_WIN_MARGIN;

    const marginTooSmall = scoreMargin < 1.2;
    const confidenceTooLow = winner.total < 1.2;

    if (marginTooSmall || confidenceTooLow) {
        if (canSafelyKeepForward) {
            return buildDirectionRow(row, "DE_LEFT_SW_RIGHT", "low", explanation);
        }
        return {
            lineNumber: row.lineNumber,
            rawLine: row.rawLine,
            leftValue: row.leftValue,
            rightValue: row.rightValue,
            reason: "Konnte die Sprachrichtung nicht sicher erkennen.",
            directionExplanation: explanation,
        };
    }

    const shouldKeepForwardDirection =
        canSafelyKeepForward &&
        rightTotalWithBias > leftTotalWithBias &&
        (rightTotalWithBias - leftTotalWithBias) < REVERSE_CLEAR_WIN_MARGIN;

    const direction: ResolvedDirection = shouldKeepForwardDirection
        ? "DE_LEFT_SW_RIGHT"
        : leftTotalWithBias > rightTotalWithBias
            ? "DE_LEFT_SW_RIGHT"
            : "SW_LEFT_DE_RIGHT";
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
    const conflicts: ConflictImportRow[] = [];
    const invalidRows = [...initialInvalidRows];
    const seenCanonicalPairs = new Set<string>();

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
                reason: "Dieses Wortpaar ist in deiner Importliste bereits enthalten.",
            });
            continue;
        }
        seenInImport.add(key);
        const canonicalKey = [resolved.germanNormalized, resolved.swahiliNormalized].sort().join("::");
        if (seenCanonicalPairs.has(canonicalKey)) {
            invalidRows.push({
                lineNumber: resolved.lineNumber,
                rawLine: resolved.rawLine,
                reason: "Dieses Wortpaar ist in deiner Importliste bereits enthalten (nur umgekehrte Richtung).",
            });
            continue;
        }
        seenCanonicalPairs.add(canonicalKey);

        if (exactPairs.has(key)) {
            exactDuplicates.push(resolved);
            continue;
        }

        const germanMatches = germanToSw.get(resolved.germanNormalized);
        const swMatches = swToGerman.get(resolved.swahiliNormalized);

        const germanConflict = Boolean(germanMatches && !germanMatches.has(resolved.swahiliNormalized));
        const swahiliConflict = Boolean(swMatches && !swMatches.has(resolved.germanNormalized));

        if (germanConflict || swahiliConflict) {
            const conflictType = germanConflict && swahiliConflict ? "BOTH" : germanConflict ? "GERMAN_EXISTS" : "SWAHILI_EXISTS";
            const existingMatches = findExistingMatches(existingCards, resolved, conflictType);
            const { reasonType, reason } = explainConflict(resolved, conflictType, existingMatches);
            conflicts.push({
                ...resolved,
                conflictType,
                reasonType,
                reason,
                existingMatches,
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


function glossTokens(value: string): string[] {
    return normalizeImportValue(value)
        .replace(/[()]/g, " ")
        .split(/[\s/,+]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length > 1);
}

function tokenOverlap(a: string, b: string): number {
    const left = new Set(glossTokens(a));
    const right = new Set(glossTokens(b));
    if (!left.size || !right.size) return 0;
    const shared = Array.from(left).filter((token) => right.has(token)).length;
    return shared / Math.max(left.size, right.size);
}

function findExistingMatches(existingCards: ExistingCard[], row: ParsedImportRow, conflictType: "GERMAN_EXISTS" | "SWAHILI_EXISTS" | "BOTH"): ExistingMatchInfo[] {
    const german = row.germanNormalized;
    const swahili = row.swahiliNormalized;
    return existingCards
        .filter((card) => {
            const cardGerman = normalizeImportValue(card.german_text ?? "");
            const cardSwahili = normalizeImportValue(card.swahili_text ?? "");
            if (!cardGerman || !cardSwahili) return false;
            if (conflictType === "GERMAN_EXISTS") return cardGerman === german;
            if (conflictType === "SWAHILI_EXISTS") return cardSwahili === swahili;
            return cardGerman === german || cardSwahili === swahili;
        })
        .slice(0, 3)
        .map((card) => ({
            id: card.id,
            german: (card.german_text ?? "").trim(),
            swahili: (card.swahili_text ?? "").trim(),
        }));
}

function explainConflict(
    row: ParsedImportRow,
    conflictType: "GERMAN_EXISTS" | "SWAHILI_EXISTS" | "BOTH",
    existingMatches: ExistingMatchInfo[]
): { reasonType: ConflictReasonType; reason: string } {
    const hasAlternativeGloss = existingMatches.some((match) =>
        conflictType === "GERMAN_EXISTS"
            ? tokenOverlap(match.swahili, row.swahili) >= 0.45
            : tokenOverlap(match.german, row.german) >= 0.45
    );

    if (hasAlternativeGloss) {
        return {
            reasonType: "ALTERNATIVE_GLOSS",
            reason: "Ähnliche Bedeutung erkannt (alternative Glossierung/Wortwahl). Bitte prüfen, ob als eigene Karte sinnvoll.",
        };
    }

    if (conflictType === "GERMAN_EXISTS") {
        return {
            reasonType: "GERMAN_SIDE_EXISTS",
            reason: "Gleiche deutsche Seite, aber bestehende Karte hat eine andere Swahili-Übersetzung.",
        };
    }

    if (conflictType === "SWAHILI_EXISTS") {
        return {
            reasonType: "SWAHILI_SIDE_EXISTS",
            reason: "Gleiche Swahili-Seite, aber bestehende Karte hat eine andere deutsche Übersetzung.",
        };
    }

    return {
        reasonType: "AMBIGUOUS_MAPPING",
        reason: "Mehrdeutige Zuordnung: Beide Seiten existieren bereits in anderen Paarungen.",
    };
}

function buildRowKey(lineNumber: number, german: string, swahili: string): string {
    return `${lineNumber}:${normalizeImportValue(german)}:${normalizeImportValue(swahili)}`;
}

export function buildEditablePreviewState(classification: ImportClassification): EditablePreviewRow[] {
    const fromConflicts = classification.conflicts.map((row) => ({
        rowKey: buildRowKey(row.lineNumber, row.german, row.swahili),
        lineNumber: row.lineNumber,
        rawLine: row.rawLine,
        originalGerman: row.german,
        originalSwahili: row.swahili,
        originalDirection: row.resolvedDirection,
        german: row.german,
        swahili: row.swahili,
        direction: row.resolvedDirection,
        status: "conflict" as const,
        reason: row.reason,
        reasonType: row.reasonType,
        existingMatches: row.existingMatches,
        directionExplanation: row.directionExplanation,
        selectedAction: "keep" as const,
    }));

    const fromAmbiguous = classification.ambiguousRows.map((row) => ({
        rowKey: buildRowKey(row.lineNumber, row.leftValue, row.rightValue),
        lineNumber: row.lineNumber,
        rawLine: row.rawLine,
        originalGerman: row.leftValue,
        originalSwahili: row.rightValue,
        originalDirection: "DE_LEFT_SW_RIGHT" as const,
        german: row.leftValue,
        swahili: row.rightValue,
        direction: "DE_LEFT_SW_RIGHT" as const,
        status: "ambiguous" as const,
        reason: row.reason,
        directionExplanation: row.directionExplanation,
        selectedAction: "keep" as const,
    }));

    const fromInvalid = classification.invalidRows.map((row) => ({
        rowKey: `${row.lineNumber}:invalid`,
        lineNumber: row.lineNumber,
        rawLine: row.rawLine,
        originalGerman: "",
        originalSwahili: "",
        originalDirection: "DE_LEFT_SW_RIGHT" as const,
        german: "",
        swahili: "",
        direction: "DE_LEFT_SW_RIGHT" as const,
        status: "invalid" as const,
        reason: row.reason,
        selectedAction: "skip" as const,
    }));

    return [...fromConflicts, ...fromAmbiguous, ...fromInvalid];
}

export function revalidatePreviewRow(
    row: Pick<EditablePreviewRow, "lineNumber" | "rawLine" | "german" | "swahili" | "direction" | "selectedAction">,
    existingCards: ExistingCard[]
): EditablePreviewRow {
    const german = cleanForStorage(row.german);
    const swahili = cleanForStorage(row.swahili);

    if (!german || !swahili) {
        return {
            rowKey: buildRowKey(row.lineNumber, german, swahili),
            lineNumber: row.lineNumber,
            rawLine: row.rawLine,
            originalGerman: german,
            originalSwahili: swahili,
            originalDirection: row.direction,
            german,
            swahili,
            direction: row.direction,
            status: row.selectedAction === "skip" ? "skipped" : "invalid",
            reason: "Beide Felder müssen ausgefüllt sein.",
            selectedAction: row.selectedAction,
        };
    }

    const leftValue = row.direction === "DE_LEFT_SW_RIGHT" ? german : swahili;
    const rightValue = row.direction === "DE_LEFT_SW_RIGHT" ? swahili : german;

    const classification = classifyImportRows([
        {
            lineNumber: row.lineNumber,
            rawLine: row.rawLine || `${leftValue} = ${rightValue}`,
            leftValue,
            rightValue,
            leftNormalized: normalizeImportValue(leftValue),
            rightNormalized: normalizeImportValue(rightValue),
        },
    ], existingCards, row.direction);

    let status: EditablePreviewStatus = "invalid";
    let reason = "Zeile ist ungültig.";
    let reasonType: ConflictReasonType | undefined;
    let existingMatches: ExistingMatchInfo[] | undefined;
    let directionExplanation: string | undefined;

    if (classification.newRows.length > 0) {
        status = "importable";
        reason = "Kann importiert werden.";
        directionExplanation = classification.newRows[0].directionExplanation;
    } else if (classification.exactDuplicates.length > 0) {
        status = "duplicate";
        reason = "Dieses Paar existiert bereits.";
    } else if (classification.conflicts.length > 0) {
        status = "conflict";
        reason = classification.conflicts[0].reason;
        reasonType = classification.conflicts[0].reasonType;
        existingMatches = classification.conflicts[0].existingMatches;
        directionExplanation = classification.conflicts[0].directionExplanation;
    } else if (classification.ambiguousRows.length > 0) {
        status = "ambiguous";
        reason = classification.ambiguousRows[0].reason;
        directionExplanation = classification.ambiguousRows[0].directionExplanation;
    } else if (classification.invalidRows.length > 0) {
        status = "invalid";
        reason = classification.invalidRows[0].reason;
    }

    if (row.selectedAction === "skip") status = "skipped";

    return {
        rowKey: buildRowKey(row.lineNumber, german, swahili),
        lineNumber: row.lineNumber,
        rawLine: row.rawLine,
        originalGerman: german,
        originalSwahili: swahili,
        originalDirection: row.direction,
        german,
        swahili,
        direction: row.direction,
        status,
        reason,
        reasonType,
        existingMatches,
        directionExplanation,
        selectedAction: row.selectedAction,
    };
}

