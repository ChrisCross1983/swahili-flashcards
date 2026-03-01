export type EnrichmentCardInput = {
    id: string;
    german_text: string;
    swahili_text: string;
    type?: "vocab" | "sentence" | null;
};

export type EnrichmentExample = {
    sw: string;
    de: string;
    tags?: string[];
};

export type CardEnrichment = {
    owner_key: string;
    card_id: string;
    type: "vocab" | "sentence";
    pos: "noun" | "verb" | "adj" | "phrase" | "unknown";
    noun_class: string | null;
    singular: string | null;
    plural: string | null;
    examples: EnrichmentExample[];
    mnemonic: string | null;
    notes: string | null;
    updated_at?: string;
};

function inferPos(sw: string): CardEnrichment["pos"] {
    const value = sw.trim().toLowerCase();
    if (!value) return "unknown";
    if (value.startsWith("ku")) return "verb";
    if (value.includes(" ")) return "phrase";
    if (value.startsWith("m") || value.startsWith("ki") || value.startsWith("n")) return "noun";
    return "unknown";
}

function inferNounForms(sw: string): Pick<CardEnrichment, "noun_class" | "singular" | "plural"> {
    const value = sw.trim().toLowerCase();
    if (!value) return { noun_class: null, singular: null, plural: null };
    if (value.startsWith("ki")) return { noun_class: "ki/vi", singular: value, plural: `vi${value.slice(2)}` };
    if (value.startsWith("m")) return { noun_class: "m/wa", singular: value, plural: `wa${value.slice(1)}` };
    if (value.startsWith("n")) return { noun_class: "n/n", singular: value, plural: value };
    return { noun_class: null, singular: value, plural: null };
}

function fallbackExamples(card: EnrichmentCardInput, pos: CardEnrichment["pos"]): EnrichmentExample[] {
    const sw = card.swahili_text.trim() || "neno";
    const de = card.german_text.trim() || "Wort";

    if (pos === "verb") {
        return [
            { sw: `Ninataka ${sw}.`, de: `Ich möchte ${de}.` },
            { sw: `Leo ninaweza ${sw}.`, de: `Heute kann ich ${de}.` },
            { sw: `Tunajaribu ${sw} kila siku.`, de: `Wir versuchen ${de} jeden Tag.` },
        ];
    }

    if (pos === "noun") {
        return [
            { sw: `Hii ni ${sw}.`, de: `Das ist ${de}.` },
            { sw: `Ninanunua ${sw} sokoni.`, de: `Ich kaufe ${de} auf dem Markt.` },
            { sw: `Ninatumia ${sw} kila siku.`, de: `Ich benutze ${de} jeden Tag.` },
        ];
    }

    return [
        { sw: `Tunasema "${sw}" mara nyingi.`, de: `Wir sagen "${de}" oft.` },
        { sw: `Leo natumia "${sw}" kwenye mazungumzo.`, de: `Heute nutze ich "${de}" im Gespräch.` },
    ];
}

function fallbackNotes(pos: CardEnrichment["pos"], nounClass: string | null, singular: string | null, plural: string | null): string {
    if (pos === "noun" && nounClass && singular) {
        return plural
            ? `Achte auf die Nomenklasse ${nounClass}: ${singular} im Singular, ${plural} im Plural.`
            : `Achte auf die Nomenklasse ${nounClass}; sprich das Wort in einem kurzen Alltagssatz.`;
    }

    if (pos === "verb") {
        return "Übe das Verb mit 'leo' (heute), damit du es direkt im Alltag einsetzen kannst.";
    }

    return "Sprich das Wort laut in einem kurzen eigenen Satz, damit es schneller aktiv wird.";
}

function normalizeExamples(examples: EnrichmentExample[]): EnrichmentExample[] {
    return examples
        .map((example) => ({
            sw: (example.sw ?? "").trim(),
            de: (example.de ?? "").trim(),
            tags: Array.isArray(example.tags) ? example.tags.filter(Boolean) : undefined,
        }))
        .filter((example) => example.sw.length > 0 && example.de.length > 0)
        .slice(0, 3);
}

async function generateWithAi(card: EnrichmentCardInput): Promise<Partial<CardEnrichment> | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const payload = {
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        input: [
            {
                role: "system",
                content: [
                    {
                        type: "input_text",
                        text: "Du erzeugst Lern-Enrichment für Swahili-Karteikarten. Gib ausschließlich kompaktes JSON zurück.",
                    },
                ],
            },
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: `Karte:\nSwahili: ${card.swahili_text}\nDeutsch: ${card.german_text}\nTyp: ${card.type ?? "vocab"}\n\nErzeuge JSON mit Feldern: pos(noun|verb|adj|phrase|unknown), noun_class|null, singular|null, plural|null, examples[{sw,de,tags?}] (2-3 natürliche Beispiele), mnemonic|null, notes (konkreter Lerntipp auf Deutsch). Keine weiteren Felder.`,
                    },
                ],
            },
        ],
        text: {
            format: {
                type: "json_schema",
                name: "enrichment",
                strict: true,
                schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        pos: { type: "string", enum: ["noun", "verb", "adj", "phrase", "unknown"] },
                        noun_class: { type: ["string", "null"] },
                        singular: { type: ["string", "null"] },
                        plural: { type: ["string", "null"] },
                        examples: {
                            type: "array",
                            minItems: 2,
                            maxItems: 3,
                            items: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    sw: { type: "string" },
                                    de: { type: "string" },
                                    tags: { type: "array", items: { type: "string" } },
                                },
                                required: ["sw", "de"],
                            },
                        },
                        mnemonic: { type: ["string", "null"] },
                        notes: { type: "string" },
                    },
                    required: ["pos", "noun_class", "singular", "plural", "examples", "mnemonic", "notes"],
                },
            },
        },
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { output_text?: string };
    const raw = data.output_text?.trim();
    if (!raw) return null;

    try {
        return JSON.parse(raw) as Partial<CardEnrichment>;
    } catch {
        return null;
    }
}

export async function generateEnrichment(ownerKey: string, card: EnrichmentCardInput): Promise<CardEnrichment> {
    const pos = inferPos(card.swahili_text);
    const nounForms = inferNounForms(card.swahili_text);

    const aiResult = await generateWithAi(card);
    const examples = normalizeExamples((aiResult?.examples as EnrichmentExample[] | undefined) ?? fallbackExamples(card, pos));

    const enrichment: CardEnrichment = {
        owner_key: ownerKey,
        card_id: card.id,
        type: card.type === "sentence" ? "sentence" : "vocab",
        pos: (aiResult?.pos as CardEnrichment["pos"] | undefined) ?? pos,
        noun_class: (aiResult?.noun_class as string | null | undefined) ?? nounForms.noun_class,
        singular: (aiResult?.singular as string | null | undefined) ?? nounForms.singular,
        plural: (aiResult?.plural as string | null | undefined) ?? nounForms.plural,
        examples: examples.length > 0 ? examples : fallbackExamples(card, pos),
        mnemonic: (aiResult?.mnemonic as string | null | undefined) ?? null,
        notes: (aiResult?.notes as string | undefined)?.trim() || fallbackNotes(pos, nounForms.noun_class, nounForms.singular, nounForms.plural),
    };

    return enrichment;
}

export async function getOrCreateEnrichment(ownerKey: string, card: EnrichmentCardInput): Promise<CardEnrichment> {
    const { supabaseServer } = await import("@/lib/supabaseServer");
    
    const { data } = await supabaseServer
        .from("ai_card_enrichment")
        .select("owner_key, card_id, type, pos, noun_class, singular, plural, examples, mnemonic, notes")
        .eq("owner_key", ownerKey)
        .eq("card_id", card.id)
        .maybeSingle();

    if (data) {
        const normalizedExamples = normalizeExamples((data.examples as EnrichmentExample[]) ?? []);
        return {
            owner_key: data.owner_key,
            card_id: data.card_id,
            type: data.type === "sentence" ? "sentence" : "vocab",
            pos: ["noun", "verb", "adj", "phrase", "unknown"].includes(data.pos) ? (data.pos as CardEnrichment["pos"]) : "unknown",
            noun_class: data.noun_class,
            singular: data.singular,
            plural: data.plural,
            examples: normalizedExamples,
            mnemonic: data.mnemonic,
            notes: data.notes,
        };
    }

    const enrichment = await generateEnrichment(ownerKey, card);

    await supabaseServer
        .from("ai_card_enrichment")
        .upsert({ ...enrichment, updated_at: new Date().toISOString() }, { onConflict: "owner_key,card_id" });

    return enrichment;
}
