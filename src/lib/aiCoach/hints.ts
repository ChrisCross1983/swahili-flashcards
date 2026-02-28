import type { Direction } from "@/lib/trainer/types";
import type { SourceCard } from "./tasks/generate";

function parseNounClass(word: string): { nounClass: string; plural?: string } | null {
    const lower = word.trim().toLowerCase();
    if (!lower) return null;

    if (lower.startsWith("mwa")) {
        const plural = `wa${lower.slice(3)}`;
        return { nounClass: "m/wa", plural };
    }
    if (lower.startsWith("mw")) {
        const plural = `wa${lower.slice(2)}`;
        return { nounClass: "m/wa", plural };
    }
    if (lower.startsWith("m")) {
        const plural = `wa${lower.slice(1)}`;
        return { nounClass: "m/wa", plural };
    }
    if (lower.startsWith("ki")) {
        const plural = `vi${lower.slice(2)}`;
        return { nounClass: "ki/vi", plural };
    }
    if (lower.startsWith("n")) {
        return { nounClass: "n/n", plural: lower };
    }
    return null;
}

export function buildHintForCard(card: SourceCard, direction: Direction): string {
    const source = direction === "DE_TO_SW" ? card.german_text : card.swahili_text;
    return `Denk an den Kontext: "${source}" wird oft in kurzen Alltagssätzen benutzt.`;
}

export function buildLearnTipForCard(card: SourceCard): string {
    const sw = card.swahili_text.trim();
    const guessed = parseNounClass(sw);

    if (guessed?.plural) {
        return `Nominalklasse ${guessed.nounClass}: Singular ${sw} → Plural ${guessed.plural}`;
    }

    if (sw.startsWith("ku")) {
        return `Verbform: ${sw} als Handlung laut sagen und mit "leo" im Satz üben.`;
    }

    return `Merktipp: Nutze "${sw}" heute in einem kurzen Alltagssatz.`;
}

export function inferCardMeta(card: SourceCard): { pos: "noun" | "verb" | "other"; nounClass?: string; plural?: string } {
    const sw = card.swahili_text.trim().toLowerCase();
    if (sw.startsWith("ku")) return { pos: "verb" };

    const nounClass = parseNounClass(sw);
    if (nounClass) {
        return { pos: "noun", nounClass: nounClass.nounClass, plural: nounClass.plural };
    }

    return { pos: "other" };
}
