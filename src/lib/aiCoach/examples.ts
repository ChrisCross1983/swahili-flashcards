import type { Direction } from "@/lib/trainer/types";
import type { SourceCard } from "./tasks/generate";

export function buildExampleSentence(card: SourceCard, _direction: Direction): { sw: string; de: string } {
    const sw = card.swahili_text.trim();
    const de = card.german_text.trim();

    if (!sw && !de) {
        return { sw: "Leo tunajifunza neno jipya.", de: "Heute lernen wir ein neues Wort." };
    }

    if (sw.includes(" ") && de.includes(" ")) {
        return { sw, de };
    }

    const safeSw = sw || "neno";
    const safeDe = de || "ein Wort";
    return {
        sw: `Leo natumia ${safeSw} katika sentensi fupi.`,
        de: `Heute benutze ich ${safeDe} in einem kurzen Satz.`,
    };
}
