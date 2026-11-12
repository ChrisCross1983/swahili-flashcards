import { supabaseServer } from "@/lib/supabaseServer";
import { hasWordUnderstanding, type WordEnrichment } from "@/lib/word/understanding";

export async function getWordUnderstandingByCard(ownerKey: string, cards: Array<{ id: string | number; type?: string | null }>): Promise<Map<string, WordEnrichment>> {
    const ids = cards.filter((card) => card.type !== "sentence").map((card) => String(card.id));
    const result = new Map<string, WordEnrichment>();
    for (let start = 0; start < ids.length; start += 150) {
        const { data, error } = await supabaseServer.from("ai_card_enrichment")
            .select("card_id,pos,noun_class,singular,plural,examples,mnemonic,notes")
            .eq("owner_key", ownerKey).in("card_id", ids.slice(start, start + 150));
        if (error) throw error;
        for (const row of data ?? []) {
            const enrichment: WordEnrichment = {
                pos: row.pos, noun_class: row.noun_class, singular: row.singular, plural: row.plural,
                examples: Array.isArray(row.examples) ? row.examples : [], mnemonic: row.mnemonic, notes: row.notes,
            };
            if (hasWordUnderstanding(enrichment)) result.set(String(row.card_id), enrichment);
        }
    }
    return result;
}
