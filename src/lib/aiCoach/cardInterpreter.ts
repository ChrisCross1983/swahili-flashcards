import type { CardEnrichment } from "./enrichment/generateEnrichment";

export type CardLike = {
    id: string;
    german_text: string;
    swahili_text: string;
    type?: "vocab" | "sentence" | null;
};

export type CardPedagogicalProfile = {
    cardType: "vocab" | "sentence" | "phrase";
    linguisticUnit: "word" | "compound" | "sentence";
    pos: "noun" | "verb" | "adjective" | "expression" | "unknown";
    morphologicalFeatures: {
        nounClass?: string;
        plural?: string;
        tense?: "infinitive" | "present" | "past" | "future" | "unknown";
    };
    semanticComplexity: "simple" | "medium" | "complex";
    learningDifficulty: 1 | 2 | 3 | 4 | 5;
    exerciseCapabilities: {
        translation: boolean;
        recognition: boolean;
        cloze: boolean;
        production: boolean;
        contextUsage: boolean;
    };
    exampleStrategy: "templateSafe" | "aiRequired" | "enrichmentPreferred";
};

function inferPos(card: CardLike, enrichment?: CardEnrichment | null): CardPedagogicalProfile["pos"] {
    const fromEnrichment = enrichment?.pos;
    if (fromEnrichment === "noun") return "noun";
    if (fromEnrichment === "verb") return "verb";
    if (fromEnrichment === "adj") return "adjective";
    if (fromEnrichment === "phrase") return "expression";

    const sw = card.swahili_text.trim().toLowerCase();
    if (sw.startsWith("ku")) return "verb";
    if (sw.includes(" ")) return "expression";
    if (sw.startsWith("m") || sw.startsWith("ki") || sw.startsWith("n")) return "noun";
    return "unknown";
}

function inferLinguisticUnit(card: CardLike): CardPedagogicalProfile["linguisticUnit"] {
    const sw = card.swahili_text.trim();
    const words = sw.split(/\s+/).filter(Boolean).length;
    if (card.type === "sentence" || words >= 5 || /[.!?]/.test(sw)) return "sentence";
    if (words >= 2) return "compound";
    return "word";
}

function inferComplexity(card: CardLike, unit: CardPedagogicalProfile["linguisticUnit"]): CardPedagogicalProfile["semanticComplexity"] {
    const swLen = card.swahili_text.trim().length;
    if (unit === "sentence" || swLen > 18) return "complex";
    if (unit === "compound" || swLen > 9) return "medium";
    return "simple";
}

function inferDifficulty(pos: CardPedagogicalProfile["pos"], complexity: CardPedagogicalProfile["semanticComplexity"]): 1 | 2 | 3 | 4 | 5 {
    const base = complexity === "simple" ? 2 : complexity === "medium" ? 3 : 4;
    const offset = pos === "verb" ? 1 : pos === "unknown" ? 1 : 0;
    return Math.max(1, Math.min(5, base + offset)) as 1 | 2 | 3 | 4 | 5;
}

export function interpretCard(card: CardLike, enrichment?: CardEnrichment | null): CardPedagogicalProfile {
    const unit = inferLinguisticUnit(card);
    const pos = inferPos(card, enrichment);
    const complexity = inferComplexity(card, unit);

    const isSentenceLike = unit === "sentence";
    const nounClass = enrichment?.noun_class ?? undefined;
    const plural = enrichment?.plural ?? undefined;

    return {
        cardType: card.type === "sentence" ? "sentence" : unit === "compound" ? "phrase" : "vocab",
        linguisticUnit: unit,
        pos,
        morphologicalFeatures: {
            nounClass,
            plural,
            tense: pos === "verb" ? "infinitive" : undefined,
        },
        semanticComplexity: complexity,
        learningDifficulty: inferDifficulty(pos, complexity),
        exerciseCapabilities: {
            translation: true,
            recognition: true,
            cloze: isSentenceLike || Boolean(enrichment?.examples?.length),
            production: !isSentenceLike,
            contextUsage: isSentenceLike || pos === "expression" || complexity !== "simple",
        },
        exampleStrategy: isSentenceLike ? "enrichmentPreferred" : complexity === "simple" ? "templateSafe" : "aiRequired",
    };
}
