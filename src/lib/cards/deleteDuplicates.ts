export type DuplicateDeleteResult =
    | { ok: true; deletedCount: number; warnings: string[] }
    | { ok: false; status: number; error: string };

type SupabaseLike = {
    from: (table: string) => any;
};

const REQUIRED_TABLES = ["learn_last_missed", "card_groups", "card_progress"];
const OPTIONAL_TABLES = ["ai_learner_state", "ai_card_mastery", "ai_card_enrichment"];

function isMissingTableError(error: { message?: string; code?: string } | null | undefined): boolean {
    if (!error) return false;
    const message = String(error.message ?? "").toLowerCase();
    return error.code === "PGRST205"
        || error.code === "42P01"
        || message.includes("could not find the table")
        || message.includes("relation") && message.includes("does not exist");
}

export async function deleteUserDuplicateCards(params: {
    supabase: SupabaseLike;
    userId: string;
    cardIds: string[];
    logger?: Pick<Console, "warn" | "error">;
}): Promise<DuplicateDeleteResult> {
    const { supabase, userId, logger = console } = params;
    const cardIds = Array.from(new Set(params.cardIds.map((id) => String(id).trim()).filter(Boolean)));

    if (!cardIds.length) {
        return { ok: false, status: 400, error: "Keine Karten ausgewählt." };
    }

    const { data: ownedCards, error: ownershipError } = await supabase
        .from("cards")
        .select("id")
        .eq("owner_key", userId)
        .in("id", cardIds);

    if (ownershipError) {
        logger.error(ownershipError);
        return { ok: false, status: 500, error: "Löschen fehlgeschlagen (Ownership)." };
    }

    const ownedIds = new Set((ownedCards ?? []).map((card: { id: string | number }) => String(card.id)));
    if (ownedIds.size !== cardIds.length) {
        return { ok: false, status: 403, error: "Einige Karten können nicht gelöscht werden." };
    }

    for (const tableName of REQUIRED_TABLES) {
        const { error } = await supabase
            .from(tableName)
            .delete()
            .eq("owner_key", userId)
            .in("card_id", cardIds);

        if (error) {
            logger.error({ tableName, error });
            return { ok: false, status: 500, error: `Löschen fehlgeschlagen (${tableName}).` };
        }
    }

    const warnings: string[] = [];
    for (const tableName of OPTIONAL_TABLES) {
        const { error } = await supabase
            .from(tableName)
            .delete()
            .eq("owner_key", userId)
            .in("card_id", cardIds);

        if (!error) continue;

        const warning = isMissingTableError(error)
            ? `Optionale Tabelle '${tableName}' nicht vorhanden; Cleanup übersprungen.`
            : `Optionales Cleanup in '${tableName}' fehlgeschlagen; fortgesetzt.`;

        warnings.push(warning);
        logger.warn({ tableName, error, warning });
    }

    const { error: cardsError } = await supabase
        .from("cards")
        .delete()
        .eq("owner_key", userId)
        .in("id", cardIds);

    if (cardsError) {
        logger.error(cardsError);
        return { ok: false, status: 500, error: "Löschen fehlgeschlagen." };
    }

    return { ok: true, deletedCount: cardIds.length, warnings };
}

export const __internal = {
    isMissingTableError,
    REQUIRED_TABLES,
    OPTIONAL_TABLES,
};
