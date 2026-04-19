import { normalizeText } from "@/lib/cards/saveFlow";

export type CardDomainType = "vocab" | "sentence";

export type ExistingCardLike = {
    id: string | number;
    swahili_text?: string | null;
    german_text?: string | null;
    swahili_example?: string | null;
    german_example?: string | null;
    type?: string | null;
};

export function cardMatchesDomain(cardType: string | null | undefined, requestedType: CardDomainType): boolean {
    if (requestedType === "sentence") return cardType === "sentence";
    return cardType == null || cardType === "vocab";
}

export function findExistingMatch(
    cards: ExistingCardLike[],
    params: { sw: string; de: string; type: CardDomainType }
): { existingId: string | null; match: "pair" | "swap" | "sw" | "de" | null } {
    const normalizedSw = normalizeText(params.sw);
    const normalizedDe = normalizeText(params.de);

    let swMatch: ExistingCardLike | null = null;
    let deMatch: ExistingCardLike | null = null;

    for (const card of cards) {
        if (!cardMatchesDomain(card.type, params.type)) continue;

        const existingSw = normalizeText(card.swahili_text ?? "");
        const existingDe = normalizeText(card.german_text ?? "");
        const isPair = existingSw === normalizedSw && existingDe === normalizedDe;
        const isSwap = existingSw === normalizedDe && existingDe === normalizedSw;
        if (isPair) return { existingId: String(card.id), match: "pair" };
        if (isSwap) return { existingId: String(card.id), match: "swap" };
        if (!swMatch && existingSw === normalizedSw) swMatch = card;
        if (!deMatch && existingDe === normalizedDe) deMatch = card;
    }

    if (swMatch) return { existingId: String(swMatch.id), match: "sw" };
    if (deMatch) return { existingId: String(deMatch.id), match: "de" };
    return { existingId: null, match: null };
}
