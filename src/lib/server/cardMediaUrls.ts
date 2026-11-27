import { supabaseServer } from "@/lib/supabaseServer";
import { CARD_AUDIO_BUCKET, cardImageBucket } from "@/lib/server/cardMediaStorage";

export const CARD_MEDIA_SIGNED_URL_TTL_SECONDS = 30 * 60;

export type CardMediaRow = {
    id: string | number;
    image_path?: string | null;
    audio_path?: string | null;
};

export type CardMediaUrls = {
    imageUrl: string | null;
    audioUrl: string | null;
    expiresAt: string;
};

type SignedUrlRow = { path?: string | null; signedUrl?: string | null };

type StorageSigner = {
    storage: {
        from: (bucket: string) => {
            createSignedUrls: (paths: string[], expiresIn: number) => Promise<{
                data: SignedUrlRow[] | null;
                error: { code?: string; message?: string } | null;
            }>;
        };
    };
};

export class CardMediaSigningError extends Error {
    constructor() {
        super("card_media_signing_failed");
    }
}

/**
 * Storage keys originate in an already owner-scoped card row. Root-level image
 * keys are intentionally accepted for the six historic records; a key itself
 * is never used as the authorization decision.
 */
export function isSafeCardMediaStoragePath(value: unknown): value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > 1024) return false;
    if (value.startsWith("/") || value.includes("\\") || value.includes("\0") || /^https?:\/\//i.test(value)) return false;
    return !value.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function uniquePaths(rows: CardMediaRow[], key: "image_path" | "audio_path") {
    const paths = rows.map((row) => row[key]).filter((path): path is string => path != null);
    if (!paths.every(isSafeCardMediaStoragePath)) throw new CardMediaSigningError();
    return Array.from(new Set(paths));
}

async function signBucketPaths(
    signer: StorageSigner,
    bucket: string,
    paths: string[],
    expiresIn: number,
): Promise<Map<string, string>> {
    if (paths.length === 0) return new Map();
    const { data, error } = await signer.storage.from(bucket).createSignedUrls(paths, expiresIn);
    if (error || !data) throw new CardMediaSigningError();

    const signed = new Map<string, string>();
    for (const entry of data) {
        if (typeof entry.path === "string" && typeof entry.signedUrl === "string" && entry.signedUrl.length > 0) {
            signed.set(entry.path, entry.signedUrl);
        }
    }
    if (paths.some((path) => !signed.has(path))) throw new CardMediaSigningError();
    return signed;
}

/**
 * Signs only paths selected from card rows which the caller has already scoped
 * to an authenticated owner. Do not call this with client-provided paths.
 */
export async function signAuthorizedCardMediaUrls(
    rows: CardMediaRow[],
    { signer = supabaseServer as unknown as StorageSigner, expiresIn = CARD_MEDIA_SIGNED_URL_TTL_SECONDS }: {
        signer?: StorageSigner;
        expiresIn?: number;
    } = {},
): Promise<Record<string, CardMediaUrls>> {
    const imagePaths = uniquePaths(rows, "image_path");
    const audioPaths = uniquePaths(rows, "audio_path");
    const imageBucket = imagePaths.length > 0 ? cardImageBucket() : null;
    if (imagePaths.length > 0 && !imageBucket) throw new CardMediaSigningError();

    const [images, audio] = await Promise.all([
        imageBucket ? signBucketPaths(signer, imageBucket, imagePaths, expiresIn) : Promise.resolve(new Map<string, string>()),
        signBucketPaths(signer, CARD_AUDIO_BUCKET, audioPaths, expiresIn),
    ]);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return Object.fromEntries(rows.map((row) => [String(row.id), {
        imageUrl: row.image_path ? images.get(row.image_path) ?? null : null,
        audioUrl: row.audio_path ? audio.get(row.audio_path) ?? null : null,
        expiresAt,
    }]));
}
