import type { CardEnrichment } from "@/lib/aiCoach/enrichment/generateEnrichment";

export type WordEnrichment = Pick<CardEnrichment, "pos" | "noun_class" | "singular" | "plural" | "examples" | "mnemonic" | "notes">;

export function hasWordUnderstanding(value: WordEnrichment | null | undefined): boolean {
    if (!value || typeof value.notes !== "string" || !value.notes.trim() || !Array.isArray(value.examples) || !value.examples.length ||
        !value.examples.every((example) => typeof example?.sw === "string" && example.sw.trim() && typeof example?.de === "string" && example.de.trim())) return false;
    // These are exact generic fallback texts from the older AI-coach enrichment path.
    if (value.notes.startsWith("Achte auf die Nomenklasse ") ||
        value.notes.startsWith("Übe das Verb mit 'leo'") ||
        value.notes.startsWith("Sprich das Wort laut in einem kurzen eigenen Satz")) return false;
    return ["noun", "verb", "adj", "phrase", "unknown"].includes(value.pos);
}

export function wordTypeLabel(pos: WordEnrichment["pos"]): string {
    return { noun: "Substantiv", verb: "Verb", adj: "Adjektiv", phrase: "Fester Ausdruck", unknown: "Wort & Verwendung" }[pos];
}

export function nounClassLabel(value: string | null): string | null {
    if (!value?.trim()) return null;
    const key = value.trim().toLowerCase().replace(/[\s–—-]+/g, "").replace(/\//g, "");
    const known: Record<string, string> = {
        mwa: "M-WA · Klasse 1/2", mmi: "M-MI · Klasse 3/4", jima: "JI-MA · Klasse 5/6",
        kivi: "KI-VI · Klasse 7/8", nn: "N/N · Klasse 9/10", u: "U", ku: "KU",
    };
    return known[key] ?? null;
}

export const ingiForms = [
    { noun: "watu", form: "wengi", nounClass: "M-WA · Klasse 1/2" },
    { noun: "vitabu", form: "vingi", nounClass: "KI-VI · Klasse 7/8" },
    { noun: "mambo", form: "mengi", nounClass: "JI-MA · Klasse 5/6" },
    { noun: "nyumba", form: "nyingi", nounClass: "N/N · Klasse 9/10" },
] as const;

export function isIngiForm(word: string): boolean {
    return ingiForms.some(({ form }) => form === word.trim().toLowerCase());
}

export function briefLearningNote(value: string | null): string | null {
    if (!value?.trim()) return null;
    const clean = value.trim().replace(/\s+/g, " ");
    const firstTwo = clean.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    if (firstTwo.length <= 150) return firstTwo;
    const cut = firstTwo.slice(0, 147).lastIndexOf(" ");
    return `${firstTwo.slice(0, cut > 90 ? cut : 147).trimEnd()}…`;
}

export function concordChange(value: string | null): string | null {
    const match = value?.match(/\b(u-|i-|wa-|ya-|ki-|vi-)\s+(?:zu|→)\s+(u-|i-|wa-|ya-|ki-|vi-)/i);
    return match ? `${match[1]} → ${match[2]}` : null;
}

export type ChangedForm = { from: string; to: string };

function sentenceWords(value: string): string[] {
    return value.match(/[\p{L}\p{M}]+(?:[-'][\p{L}\p{M}]+)*/gu) ?? [];
}

function containsWord(sentence: string, word: string): boolean {
    return sentenceWords(sentence).some((part) => part.toLocaleLowerCase() === word.toLocaleLowerCase());
}

export function nounSentenceChange(enrichment: WordEnrichment): { singular: { sw: string; de: string }; plural: { sw: string; de: string }; changed: ChangedForm[] } | null {
    if (enrichment.pos !== "noun" || !enrichment.singular || !enrichment.plural) return null;
    const singular = enrichment.examples.find((example) => containsWord(example.sw, enrichment.singular ?? ""));
    const plural = enrichment.examples.find((example) => containsWord(example.sw, enrichment.plural ?? ""));
    if (!singular || !plural || singular === plural) return null;
    const first = sentenceWords(singular.sw);
    const second = sentenceWords(plural.sw);
    if (first.length !== second.length || first.length < 2 || first.length > 12) return null;
    const provided = Array.isArray(plural.changedForms) ? plural.changedForms.filter((pair) => typeof pair?.from === "string" && typeof pair?.to === "string"
        && containsWord(singular.sw, pair.from) && containsWord(plural.sw, pair.to)) : [];
    const changed = provided.length ? provided : first.flatMap((from, index) => from.toLocaleLowerCase() === second[index].toLocaleLowerCase()
        ? [] : [{ from, to: second[index] }]);
    return changed.some((pair) => pair.from.toLocaleLowerCase() === enrichment.singular?.toLocaleLowerCase()
        && pair.to.toLocaleLowerCase() === enrichment.plural?.toLocaleLowerCase()) ? { singular, plural, changed } : null;
}

export function beginnerWordHint(notes: string | null, changed: ChangedForm[] = []): string | null {
    if (/kongruenz|agreement|concord/i.test(notes ?? "")) {
        const forms = changed.map((pair) => `${pair.from.toLocaleLowerCase()}:${pair.to.toLocaleLowerCase()}`);
        if (forms.includes("hiki:hivi") && forms.includes("kikubwa:vikubwa")) {
            return "Auch „dieses/diese“ und „groß“ passen sich an die Nomenklasse an.";
        }
        return "Auch andere Wörter im Satz ändern ihre Form.";
    }
    return briefLearningNote(notes);
}

export type WordUnderstandingPreview = {
    kind: "noun" | "adjective" | "verb" | "phrase" | "other";
    nounClass: string | null;
    form: string;
    example: { sw: string; de: string } | null;
    transformation: { singular: string; plural: string } | null;
    hint: string | null;
};

export function wordUnderstandingPreview(enrichment: WordEnrichment, swahili: string, german = ""): WordUnderstandingPreview {
    const word = swahili.trim();
    const nounClass = enrichment.pos === "noun" || enrichment.pos === "adj" ? nounClassLabel(enrichment.noun_class) : null;
    const sentenceChange = nounSentenceChange(enrichment);
    if (enrichment.pos === "noun") return {
        kind: "noun", nounClass,
        form: enrichment.singular && enrichment.plural ? `${enrichment.singular} → ${enrichment.plural}` : word,
        example: sentenceChange ? null : enrichment.examples[0] ?? null,
        transformation: sentenceChange ? { singular: sentenceChange.singular.sw, plural: sentenceChange.plural.sw } : null,
        hint: sentenceChange && sentenceChange.changed.length > 1 ? "Im Plural passen sich auch andere Wörter im Satz an." : null,
    };
    if (enrichment.pos === "adj" && isIngiForm(word)) return {
        kind: "adjective", nounClass, form: `-ingi = ${german.trim() || "viel / viele"}`,
        example: null, transformation: null, hint: (() => { const current = ingiForms.find(({ form }) => form === word.toLowerCase()); return current ? `${current.noun} → ${current.form}` : null; })(),
    };
    if (enrichment.pos === "adj") return {
        kind: "adjective", nounClass, form: word,
        example: enrichment.examples[0] ?? null, transformation: null, hint: null,
    };
    if (enrichment.pos === "verb") return {
        kind: "verb", nounClass: null, form: word,
        example: enrichment.examples[0] ?? null, transformation: null,
        hint: /^(ku|kw)[a-z]+$/i.test(word) ? `Stamm: -${word.slice(2)}` : null,
    };
    if (enrichment.pos === "phrase") return {
        kind: "phrase", nounClass: null, form: word.split(/\s+/).join(" + "),
        example: null, transformation: null, hint: german.trim() || null,
    };
    return {
        kind: "other", nounClass, form: word, example: enrichment.examples[0] ?? null,
        transformation: null, hint: null,
    };
}
