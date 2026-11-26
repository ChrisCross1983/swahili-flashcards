import { supabaseServer } from "@/lib/supabaseServer";

// Card ids are currently UUIDs in production, while a few legacy/test paths
// still use opaque identifiers. Keep the accepted format deliberately narrow
// without turning a schema migration into an API breaking change.
const CARD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function parseCardId(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const cardId = value.trim();
    return CARD_ID_PATTERN.test(cardId) ? cardId : null;
}

/**
 * Service-role queries bypass RLS. Every mutation that receives a card id
 * from the client therefore needs this explicit, tenant-scoped lookup.
 */
export async function hasOwnedCard(ownerKey: string, cardId: string): Promise<boolean> {
    const { data, error } = await supabaseServer
        .from("cards")
        .select("id")
        .eq("id", cardId)
        .eq("owner_key", ownerKey)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data?.id);
}
