export type DuplicateMode = "strict" | "review" | "all";
export type DuplicateKind = "exact" | "normalized" | "direction_swapped" | "suspicious";

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

function tokenize(value: string): string[] {
    return normalizeForDuplicateComparison(value)
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean);
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

function isStrictPrefixPair(a: string, b: string): boolean {
    if (!a || !b || a === b) return false;
    return a.startsWith(`${b} `) || b.startsWith(`${a} `);
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

    const germanPrefix = isStrictPrefixPair(aGermanNormalized, bGermanNormalized);
    const swPrefix = isStrictPrefixPair(aSwNormalized, bSwNormalized);

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

    return null;
}

function clusterKindPriority(kind: DuplicateKind): number {
    switch (kind) {
        case "exact":
            return 4;
        case "normalized":
            return 3;
        case "direction_swapped":
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

export function validateClusterDeletionSelection(cluster: DuplicateCluster, deleteCardIds: string[]): string | null {
    const ids = new Set(cluster.cards.map((card) => card.id));
    const selectedCount = deleteCardIds.filter((id) => ids.has(id)).length;
    if (selectedCount === 0) return "Keine Karte ausgewählt.";
    if (selectedCount >= cluster.cards.length) return "Mindestens eine Karte muss pro Cluster behalten werden.";
    return null;
}
