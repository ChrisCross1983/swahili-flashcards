import { deleteOwnedCards, type DeleteCardsResult } from "@/lib/server/deleteCards";

type SupabaseLike = Parameters<typeof deleteOwnedCards>[0]["supabase"];

export type DuplicateDeleteResult = DeleteCardsResult & { deletedCount?: number };

export async function deleteUserDuplicateCards(params: {
    supabase: SupabaseLike;
    userId: string;
    cardIds: string[];
    logger?: Pick<Console, "warn" | "error">;
}): Promise<DuplicateDeleteResult> {
    const result = await deleteOwnedCards(params);
    return result.ok ? { ...result, deletedCount: result.deletedIds.length } : result;
}
