import type { Direction } from "@/lib/trainer/types";
import type { SourceCard } from "./tasks/generate";

export function buildExampleSentence(card: SourceCard, direction: Direction): { sw: string; de: string } {
    const sw = card.swahili_text.trim();
    const de = card.german_text.trim();

    if (!sw && !de) {
        return { sw: "Ninaona kitu.", de: "Ich sehe etwas." };
    }

    if (sw.includes(" ") && de) {
        return direction === "DE_TO_SW" ? { sw, de } : { sw, de };
    }

    const safeSw = sw || "neno";
    const safeDe = de || "ein Wort";
    return {
        sw: `Ninaona ${safeSw}.`,
        de: `Ich sehe ${safeDe}.`,
    };
}
