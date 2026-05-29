export type DuplicateMode = "strict" | "review" | "all";
export type DuplicateKind = "exact" | "normalized" | "direction_swapped" | "qualified_duplicate" | "suspicious";

export type DuplicateCard = {
    id: string;
    german_text: string;
    swahili_text: string;
    created_at?: string | null;
    image_path?: string | null;
    audio_path?: string | null;
    type?: string | null;
    progressLevel?: number;
    groupCount?: number;
};

export type KeepRecommendation = {
    keepCardId: string;
    reason: string;
};

export type DuplicateCluster = {
    clusterId: string;
    mode: "strict" | "review";
    kind: DuplicateKind;
    reason: string;
    cards: DuplicateCard[];
    recommendation?: KeepRecommendation;
};

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function stripCosmeticPunctuation(value: string): string {
    return value
        .replace(/^[\s.,;:!?"'“”„‚‘’()\[\]{}«»]+/, "")
        .replace(/[\s.,;:!?"'“”„‚‘’()\[\]{}«»]+$/, "");
}

export function normalizeForDuplicateComparison(value: string): string {
    const collapsed = normalizeWhitespace(value ?? "");
    return stripCosmeticPunctuation(collapsed).toLocaleLowerCase("de-DE");
}

const DIDACTIC_QUALIFIER_PATTERN = /\s*[\(\[]?(?:verb|verben|nomen|substantiv|adjektiv|adverb|präposition|praeposition|pronomen|artikel|konjunktion|interjektion|phrase|ausdruck|noun|verb\.|adj\.|adjective|adverb|preposition|pronoun|article|conjunction|interjection)[\)\]]?\s*$/iu;

function normalizeForDedupeBase(value: string): string {
    let normalized = normalizeWhitespace(value ?? "").toLocaleLowerCase("de-DE");
    let previous = "";

    while (normalized && normalized !== previous) {
        previous = normalized;
        normalized = normalizeWhitespace(normalized.replace(DIDACTIC_QUALIFIER_PATTERN, ""));
    }

    return stripCosmeticPunctuation(normalized);
}

function hasDidacticQualifier(value: string): boolean {
    return DIDACTIC_QUALIFIER_PATTERN.test(normalizeWhitespace(value));
}

function tokenize(value: string): string[] {
    return normalizeForDuplicateComparison(value)
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean);
}

function tokenCount(value: string): number {
    return tokenize(value).length;
}

function tokenOverlap(left: string, right: string): number {
    const leftTokens = new Set(tokenize(left));
    const rightTokens = new Set(tokenize(right));
    if (!leftTokens.size || !rightTokens.size) return 0;

    let shared = 0;
    for (const token of leftTokens) {
        if (rightTokens.has(token)) shared += 1;
    }

    return shared / Math.max(leftTokens.size, rightTokens.size);
}

function levenshteinDistance(left: string, right: string): number {
    if (left === right) return 0;
    if (!left) return right.length;
    if (!right) return left.length;

    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = Array.from({ length: right.length + 1 }, () => 0);

    for (let i = 1; i <= left.length; i += 1) {
        current[0] = i;
        for (let j = 1; j <= right.length; j += 1) {
            const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + substitutionCost,
            );
        }
        for (let j = 0; j <= right.length; j += 1) {
            previous[j] = current[j];
        }
    }

    return previous[right.length] ?? 0;
}

export function normalizedTextSimilarity(left: string, right: string): number {
    const leftNormalized = normalizeForDuplicateComparison(left);
    const rightNormalized = normalizeForDuplicateComparison(right);
    if (!leftNormalized && !rightNormalized) return 1;
    if (!leftNormalized || !rightNormalized) return 0;
    const maxLength = Math.max(leftNormalized.length, rightNormalized.length);
    if (maxLength === 0) return 1;
    return 1 - (levenshteinDistance(leftNormalized, rightNormalized) / maxLength);
}

function isStrictPrefixPair(a: string, b: string): boolean {
    if (!a || !b || a === b) return false;
    return a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

function isClosePrefixPair(a: string, b: string): boolean {
    if (!isStrictPrefixPair(a, b)) return false;
    const shorterTokenCount = Math.min(tokenCount(a), tokenCount(b));
    const longerTokenCount = Math.max(tokenCount(a), tokenCount(b));
    if (shorterTokenCount < 2 || longerTokenCount === 0) return false;
    return shorterTokenCount / longerTokenCount >= 0.65;
}

function isNearPrefixPair(a: string, b: string): boolean {
    if (!isStrictPrefixPair(a, b)) return false;
    const shorterTokenCount = Math.min(tokenCount(a), tokenCount(b));
    const longerTokenCount = Math.max(tokenCount(a), tokenCount(b));
    if (shorterTokenCount < 2 || longerTokenCount === 0) return false;
    return shorterTokenCount / longerTokenCount >= 0.5;
}

function isSingleTokenPhrasePrefix(a: string, b: string): boolean {
    if (!isStrictPrefixPair(a, b)) return false;
    return Math.min(tokenCount(a), tokenCount(b)) <= 1 && Math.max(tokenCount(a), tokenCount(b)) >= 2;
}

function hasReviewSimilarity(left: string, right: string): boolean {
    const leftNormalized = normalizeForDuplicateComparison(left);
    const rightNormalized = normalizeForDuplicateComparison(right);
    if (!leftNormalized || !rightNormalized) return false;
    if (leftNormalized === rightNormalized) return true;
    if (isSingleTokenPhrasePrefix(leftNormalized, rightNormalized)) return false;
    if (isNearPrefixPair(leftNormalized, rightNormalized)) return true;

    const leftTokenCount = tokenCount(left);
    const rightTokenCount = tokenCount(right);
    const shorterTokenCount = Math.min(leftTokenCount, rightTokenCount);
    const longerTokenCount = Math.max(leftTokenCount, rightTokenCount);
    const tokenRatio = longerTokenCount === 0 ? 0 : shorterTokenCount / longerTokenCount;
    const overlap = tokenOverlap(left, right);
    const similarity = normalizedTextSimilarity(left, right);

    if (similarity >= 0.86 && tokenRatio >= 0.5) return true;
    if (similarity >= 0.78 && leftTokenCount === 1 && rightTokenCount === 1) return true;
    if (overlap >= 0.67 && tokenRatio >= 0.5 && shorterTokenCount >= 2) return true;

    return false;
}

type PairMatch = {
    mode: "strict" | "review";
    kind: DuplicateKind;
    reason: string;
};

function classifyPair(a: DuplicateCard, b: DuplicateCard): PairMatch | null {
    const aGermanNormalized = normalizeForDuplicateComparison(a.german_text);
    const bGermanNormalized = normalizeForDuplicateComparison(b.german_text);
    const aSwNormalized = normalizeForDuplicateComparison(a.swahili_text);
    const bSwNormalized = normalizeForDuplicateComparison(b.swahili_text);

    if (
        normalizeWhitespace(a.german_text) === normalizeWhitespace(b.german_text)
        && normalizeWhitespace(a.swahili_text) === normalizeWhitespace(b.swahili_text)
    ) {
        return {
            mode: "strict",
            kind: "exact",
            reason: "Exakte Dublette (beide Seiten identisch).",
        };
    }

    if (aGermanNormalized === bGermanNormalized && aSwNormalized === bSwNormalized) {
        return {
            mode: "strict",
            kind: "normalized",
            reason: "Normalisierte Dublette (Groß/Kleinschreibung, Leerzeichen oder Rand-Zeichen).",
        };
    }

    if (aGermanNormalized === bSwNormalized && aSwNormalized === bGermanNormalized) {
        return {
            mode: "strict",
            kind: "direction_swapped",
            reason: "Mögliche Richtungs-Dublette (Deutsch/Swahili vertauscht).",
        };
    }

    const germanDedupeBaseA = normalizeForDedupeBase(a.german_text);
    const germanDedupeBaseB = normalizeForDedupeBase(b.german_text);
    const swahiliDedupeBaseA = normalizeForDedupeBase(a.swahili_text);
    const swahiliDedupeBaseB = normalizeForDedupeBase(b.swahili_text);

    if (
        aSwNormalized === bSwNormalized
        && germanDedupeBaseA === germanDedupeBaseB
        && aGermanNormalized !== bGermanNormalized
        && (hasDidacticQualifier(a.german_text) || hasDidacticQualifier(b.german_text))
    ) {
        return {
            mode: "strict",
            kind: "qualified_duplicate",
            reason: "Didaktische Variante desselben Eintrags (z. B. Zusatz wie '(Verb)').",
        };
    }

    if (
        aGermanNormalized === bGermanNormalized
        && swahiliDedupeBaseA === swahiliDedupeBaseB
        && aSwNormalized !== bSwNormalized
        && (hasDidacticQualifier(a.swahili_text) || hasDidacticQualifier(b.swahili_text))
    ) {
        return {
            mode: "strict",
            kind: "qualified_duplicate",
            reason: "Didaktische Variante desselben Eintrags (Zusatz/Annotation auf der Gegenseite).",
        };
    }

    const germanPrefix = isClosePrefixPair(aGermanNormalized, bGermanNormalized);
    const swPrefix = isClosePrefixPair(aSwNormalized, bSwNormalized);

    if (aGermanNormalized === bGermanNormalized && swPrefix) {
        return {
            mode: "review",
            kind: "suspicious",
            reason: "Verdächtig ähnlich: gleicher Deutsch-Teil, aber Swahili ist erweitert/gekürzt.",
        };
    }

    if (aSwNormalized === bSwNormalized && germanPrefix) {
        return {
            mode: "review",
            kind: "suspicious",
            reason: "Verdächtig ähnlich: gleicher Swahili-Teil, aber Deutsch ist erweitert/gekürzt.",
        };
    }

    if (germanPrefix && swPrefix) {
        return {
            mode: "review",
            kind: "suspicious",
            reason: "Verdächtig ähnlich: auf beiden Seiten kurze Phrasen-Erweiterung.",
        };
    }

    const germanOverlap = tokenOverlap(a.german_text, b.german_text);
    const swahiliOverlap = tokenOverlap(a.swahili_text, b.swahili_text);

    if ((germanOverlap >= 0.8 && aSwNormalized === bSwNormalized) || (swahiliOverlap >= 0.8 && aGermanNormalized === bGermanNormalized)) {
        return {
            mode: "review",
            kind: "suspicious",
            reason: "Verdächtig ähnlich: starker Token-Overlap auf einer Seite.",
        };
    }

    if (
        hasReviewSimilarity(a.german_text, b.german_text)
        && hasReviewSimilarity(a.swahili_text, b.swahili_text)
    ) {
        return {
            mode: "review",
            kind: "suspicious",
            reason: "Verdächtig ähnlich: beide Seiten sind nah verwandt.",
        };
    }

    return null;
}

function clusterKindPriority(kind: DuplicateKind): number {
    switch (kind) {
        case "exact":
            return 4;
        case "normalized":
            return 3;
        case "direction_swapped":
            return 3;
        case "qualified_duplicate":
            return 2;
        case "suspicious":
        default:
            return 1;
    }
}

function pickClusterKind(kinds: DuplicateKind[]): DuplicateKind {
    return [...kinds].sort((a, b) => clusterKindPriority(b) - clusterKindPriority(a))[0] ?? "suspicious";
}

export function recommendKeepCard(cards: DuplicateCard[]): KeepRecommendation | undefined {
    if (!cards.length) return undefined;

    const withDate = cards.map((card) => ({
        card,
        createdAtMs: card.created_at ? new Date(card.created_at).getTime() : Number.POSITIVE_INFINITY,
    }));
    const oldestMs = Math.min(...withDate.map((item) => item.createdAtMs));

    const scored = cards.map((card) => {
        const reasons: string[] = [];
        let score = 0;

        if ((card.progressLevel ?? 0) > 0) {
            score += 4;
            reasons.push("hat Lernfortschritt");
        }
        if ((card.groupCount ?? 0) > 0) {
            score += 2;
            reasons.push(`ist in ${(card.groupCount ?? 0)} Gruppe(n)`);
        }
        if (card.image_path) {
            score += 1;
            reasons.push("hat Bild");
        }
        if (card.audio_path) {
            score += 1;
            reasons.push("hat Audio");
        }
        const createdAtMs = card.created_at ? new Date(card.created_at).getTime() : Number.POSITIVE_INFINITY;
        if (createdAtMs === oldestMs) {
            score += 1;
            reasons.push("ist älter/original");
        }

        return { card, score, reasons };
    }).sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));

    const winner = scored[0];
    if (!winner) return undefined;

    return {
        keepCardId: winner.card.id,
        reason: winner.reasons.length
            ? `Empfohlen zu behalten: ${winner.reasons.join(", ")}.`
            : "Empfohlen zu behalten: älteste Karte.",
    };
}

function buildClusters(cards: DuplicateCard[], mode: "strict" | "review", startIndex: number): DuplicateCluster[] {
    const parent = new Map<string, string>();
    const pairMeta = new Map<string, PairMatch>();

    for (const card of cards) {
        parent.set(card.id, card.id);
    }

    const find = (id: string): string => {
        const current = parent.get(id) ?? id;
        if (current === id) return current;
        const root = find(current);
        parent.set(id, root);
        return root;
    };

    const union = (leftId: string, rightId: string) => {
        const leftRoot = find(leftId);
        const rightRoot = find(rightId);
        if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    };

    for (let i = 0; i < cards.length; i += 1) {
        for (let j = i + 1; j < cards.length; j += 1) {
            const match = classifyPair(cards[i], cards[j]);
            if (!match || match.mode !== mode) continue;
            union(cards[i].id, cards[j].id);
            pairMeta.set(`${cards[i].id}::${cards[j].id}`, match);
        }
    }

    const groups = new Map<string, DuplicateCard[]>();
    for (const card of cards) {
        const root = find(card.id);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root)?.push(card);
    }

    const clusters: DuplicateCluster[] = [];
    let nextIndex = startIndex;

    for (const groupCards of groups.values()) {
        if (groupCards.length < 2) continue;

        const kinds: DuplicateKind[] = [];
        const reasons = new Set<string>();

        for (let i = 0; i < groupCards.length; i += 1) {
            for (let j = i + 1; j < groupCards.length; j += 1) {
                const key = `${groupCards[i].id}::${groupCards[j].id}`;
                const reverseKey = `${groupCards[j].id}::${groupCards[i].id}`;
                const match = pairMeta.get(key) ?? pairMeta.get(reverseKey);
                if (!match) continue;
                kinds.push(match.kind);
                reasons.add(match.reason);
            }
        }

        const sortedCards = [...groupCards].sort((a, b) => {
            const leftTime = a.created_at ? new Date(a.created_at).getTime() : Number.POSITIVE_INFINITY;
            const rightTime = b.created_at ? new Date(b.created_at).getTime() : Number.POSITIVE_INFINITY;
            if (leftTime !== rightTime) return leftTime - rightTime;
            return String(a.id).localeCompare(String(b.id));
        });

        clusters.push({
            clusterId: `${mode}-${nextIndex}`,
            mode,
            kind: pickClusterKind(kinds),
            reason: Array.from(reasons)[0] ?? (mode === "strict" ? "Dublette erkannt." : "Verdächtig ähnlich."),
            cards: sortedCards,
            recommendation: recommendKeepCard(sortedCards),
        });

        nextIndex += 1;
    }

    return clusters;
}

export function detectDuplicateClusters(cards: DuplicateCard[], mode: DuplicateMode = "all"): DuplicateCluster[] {
    const strictClusters = mode === "review" ? [] : buildClusters(cards, "strict", 1);
    const reviewClusters = mode === "strict" ? [] : buildClusters(cards, "review", strictClusters.length + 1);
    return [...strictClusters, ...reviewClusters];
}

export function findDuplicateCandidatesForCard(
    input: Pick<DuplicateCard, "german_text" | "swahili_text"> & { id?: string | null },
    cards: DuplicateCard[],
    options: { excludeId?: string | null } = {},
): { strict: DuplicateCard[]; similar: DuplicateCard[] } {
    const inputCard: DuplicateCard = {
        id: String(input.id ?? "__input__"),
        german_text: input.german_text,
        swahili_text: input.swahili_text,
    };
    const strict: DuplicateCard[] = [];
    const similar: DuplicateCard[] = [];

    for (const card of cards) {
        if (options.excludeId && String(card.id) === String(options.excludeId)) continue;
        const match = classifyPair(inputCard, { ...card, id: String(card.id) });
        if (!match) continue;
        if (match.mode === "strict") strict.push(card);
        else similar.push(card);
    }

    return { strict, similar };
}

export function validateClusterDeletionSelection(cluster: DuplicateCluster, deleteCardIds: string[]): string | null {
    const ids = new Set(cluster.cards.map((card) => card.id));
    const selectedCount = deleteCardIds.filter((id) => ids.has(id)).length;
    if (selectedCount === 0) return "Keine Karte ausgewählt.";
    if (selectedCount >= cluster.cards.length) return "Mindestens eine Karte muss pro Cluster behalten werden.";
    return null;
}

export function validateClusterDeletionSelections(
    clusters: DuplicateCluster[],
    selectedByCluster: Record<string, string[]>,
): string | null {
    for (const cluster of clusters) {
        const selected = selectedByCluster[cluster.clusterId] ?? [];
        if (selected.length === 0) continue;
        const validation = validateClusterDeletionSelection(cluster, selected);
        if (validation) return `${validation} (Cluster ${cluster.clusterId})`;
    }
    return null;
}
