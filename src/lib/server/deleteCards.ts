import {
    CARD_AUDIO_BUCKET,
    cardImageBucket,
    isOwnerStoragePath,
    removeStoragePaths,
    type StorageClientLike,
} from "@/lib/server/cardMediaStorage";

type DatabaseError = { message?: string; code?: string } | null;

type DeleteCardsClient = StorageClientLike & {
    from: (table: string) => unknown;
};

type OwnedCard = {
    id: string | number;
    image_path?: string | null;
    audio_path?: string | null;
};

type CardLookupTable = {
    select: (columns: string) => {
        eq: (column: string, value: string) => {
            in: (column: string, values: string[]) => Promise<{ data: OwnedCard[] | null; error: DatabaseError }>;
        };
    };
};

type CardDeleteTable = {
    delete: () => {
        eq: (column: string, value: string) => {
            in: (column: string, values: string[]) => {
                select: (columns: string) => Promise<{ data: Array<{ id: string | number }> | null; error: DatabaseError }>;
            };
        };
    };
};

type DependentDeleteTable = {
    delete: () => {
        eq: (column: string, value: string) => {
            in: (column: string, values: string[]) => Promise<{ error: DatabaseError }>;
        };
    };
};

export type DeleteCardsWarning =
    | "relational_cleanup_failed"
    | "image_cleanup_failed"
    | "audio_cleanup_failed"
    | "image_bucket_unavailable";

export type DeleteCardsResult =
    | {
        ok: true;
        deletedIds: string[];
        skippedCount: number;
        warnings: DeleteCardsWarning[];
    }
    | { ok: false; status: 400 | 500; error: string };

// These rows have no product value after their card is gone. They are cleaned
// explicitly because the production FK/cascade schema is not fully reproducible.
// learn_sessions is intentionally absent: it is immutable aggregate history.
export const CARD_DEPENDENT_TABLES = [
    "card_notes",
    "card_progress",
    "card_groups",
    "learn_last_missed",
    "ai_learner_state",
    "ai_card_enrichment",
    "ai_card_mastery",
] as const;

function missingTable(error: DatabaseError): boolean {
    if (!error) return false;
    const message = String(error.message ?? "").toLowerCase();
    return error.code === "PGRST205"
        || error.code === "42P01"
        || message.includes("could not find the table")
        || message.includes("relation") && message.includes("does not exist");
}

export async function deleteOwnedCards({
    supabase,
    userId,
    cardIds,
    imageBucket = cardImageBucket(),
    logger = console,
}: {
    supabase: DeleteCardsClient;
    userId: string;
    cardIds: string[];
    imageBucket?: string | null;
    logger?: Pick<Console, "warn" | "error">;
}): Promise<DeleteCardsResult> {
    const requestedIds = Array.from(new Set(cardIds.map((id) => String(id).trim()).filter(Boolean)));
    if (requestedIds.length === 0) return { ok: false, status: 400, error: "Keine Karten ausgewählt." };

    const cardsForLookup = supabase.from("cards") as CardLookupTable;
    const { data: ownedRows, error: lookupError } = await cardsForLookup
        .select("id,image_path,audio_path")
        .eq("owner_key", userId)
        .in("id", requestedIds);

    if (lookupError) {
        logger.error("[delete-cards] ownership lookup failed", { code: lookupError.code ?? null });
        return { ok: false, status: 500, error: "Karten konnten nicht gelöscht werden." };
    }

    const ownedCards = (ownedRows ?? []) as OwnedCard[];
    const ownedIds = ownedCards.map((card) => String(card.id));
    if (ownedIds.length === 0) {
        return { ok: true, deletedIds: [], skippedCount: requestedIds.length, warnings: [] };
    }

    // Delete the authoritative rows first. This prevents a failed card delete from
    // leaving a visible card whose progress/groups were already removed.
    const cardsForDelete = supabase.from("cards") as CardDeleteTable;
    const { data: deletedRows, error: cardsError } = await cardsForDelete
        .delete()
        .eq("owner_key", userId)
        .in("id", ownedIds)
        .select("id");

    if (cardsError) {
        logger.error("[delete-cards] card delete failed", { code: cardsError.code ?? null });
        return { ok: false, status: 500, error: "Karten konnten nicht gelöscht werden." };
    }

    const deletedIds = (deletedRows ?? []).map((row: { id: string | number }) => String(row.id));
    if (deletedIds.length === 0) {
        return { ok: true, deletedIds: [], skippedCount: requestedIds.length, warnings: [] };
    }
    const deletedSet = new Set(deletedIds);
    const deletedCards = ownedCards.filter((card) => deletedSet.has(String(card.id)));
    const warnings = new Set<DeleteCardsWarning>();

    for (const table of CARD_DEPENDENT_TABLES) {
        const dependency = supabase.from(table) as DependentDeleteTable;
        const { error } = await dependency
            .delete()
            .eq("owner_key", userId)
            .in("card_id", deletedIds);
        if (!error) continue;
        warnings.add("relational_cleanup_failed");
        logger.error("[delete-cards] dependent cleanup failed", {
            table,
            code: error.code ?? null,
            missingTable: missingTable(error),
            deletedCount: deletedIds.length,
        });
    }

    const imagePaths = deletedCards
        .map((card) => card.image_path)
        .filter((path): path is string => isOwnerStoragePath(path, userId));
    const audioPaths = deletedCards
        .map((card) => card.audio_path)
        .filter((path): path is string => isOwnerStoragePath(path, userId));

    if (imagePaths.length > 0) {
        if (!imageBucket) {
            warnings.add("image_bucket_unavailable");
            logger.error("[delete-cards] image bucket unavailable", { deletedCount: deletedIds.length });
        } else {
            const error = await removeStoragePaths(supabase, imageBucket, imagePaths);
            if (error) {
                warnings.add("image_cleanup_failed");
                logger.warn("[delete-cards] image cleanup failed", { code: error.code ?? null, objectCount: imagePaths.length });
            }
        }
    }

    if (audioPaths.length > 0) {
        const error = await removeStoragePaths(supabase, CARD_AUDIO_BUCKET, audioPaths);
        if (error) {
            warnings.add("audio_cleanup_failed");
            logger.warn("[delete-cards] audio cleanup failed", { code: error.code ?? null, objectCount: audioPaths.length });
        }
    }

    return {
        ok: true,
        deletedIds,
        skippedCount: requestedIds.length - deletedIds.length,
        warnings: Array.from(warnings),
    };
}

export const __internal = { missingTable };
