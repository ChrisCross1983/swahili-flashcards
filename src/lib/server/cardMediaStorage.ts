type StorageError = { message?: string; code?: string; statusCode?: string | number } | null;

export type StorageClientLike = {
    storage: {
        from: (bucket: string) => {
            remove: (paths: string[]) => Promise<{ error: StorageError }>;
        };
    };
};

export const CARD_AUDIO_BUCKET = "card-audio";

export function cardImageBucket(): string | null {
    return process.env.SUPABASE_STORAGE_BUCKET?.trim() || null;
}

export function isOwnerStoragePath(path: unknown, ownerKey: string): path is string {
    return typeof path === "string" && path.startsWith(`${ownerKey}/`) && path.length > ownerKey.length + 1;
}

export async function removeStoragePaths(
    client: StorageClientLike,
    bucket: string,
    paths: string[],
): Promise<StorageError> {
    const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
    if (uniquePaths.length === 0) return null;
    try {
        const { error } = await client.storage.from(bucket).remove(uniquePaths);
        return error;
    } catch {
        return { code: "storage_transport_failed" };
    }
}
