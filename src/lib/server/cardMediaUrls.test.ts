import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: {} }));
import { CARD_MEDIA_SIGNED_URL_TTL_SECONDS, CardMediaSigningError, isSafeCardMediaStoragePath, signAuthorizedCardMediaUrls } from "./cardMediaUrls";

function signer({ image = [], audio = [], imageError = null, audioError = null }: {
    image?: Array<{ path: string; signedUrl: string }>;
    audio?: Array<{ path: string; signedUrl: string }>;
    imageError?: { code: string } | null;
    audioError?: { code: string } | null;
} = {}) {
    const createSignedUrls = vi.fn((paths: string[], expiresIn: number) => Promise.resolve({
        data: paths[0]?.includes("image") || paths.includes("legacy-image.webp") ? image : audio,
        error: paths[0]?.includes("image") || paths.includes("legacy-image.webp") ? imageError : audioError,
        expiresIn,
    }));
    return { storage: { from: vi.fn(() => ({ createSignedUrls })) } };
}

describe("card media signer", () => {
    beforeEach(() => {
        process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    });
    it("signs only paths from authorized card rows, including a historic root-level image", async () => {
        const client = signer({
            image: [{ path: "legacy-image.webp", signedUrl: "https://storage.test/image-token" }],
            audio: [{ path: "owner/card-1-1.m4a", signedUrl: "https://storage.test/audio-token" }],
        });
        const result = await signAuthorizedCardMediaUrls([
            { id: "card-1", image_path: "legacy-image.webp", audio_path: "owner/card-1-1.m4a" },
        ], { signer: client, expiresIn: CARD_MEDIA_SIGNED_URL_TTL_SECONDS });

        expect(result["card-1"]).toMatchObject({
            imageUrl: "https://storage.test/image-token",
            audioUrl: "https://storage.test/audio-token",
        });
        expect(Date.parse(result["card-1"].expiresAt)).toBeGreaterThan(Date.now());
        expect(client.storage.from).toHaveBeenCalledWith("card-images");
        expect(client.storage.from).toHaveBeenCalledWith("card-audio");
    });

    it("fails closed when a signing response is incomplete", async () => {
        const client = signer({ image: [] });
        await expect(signAuthorizedCardMediaUrls([{ id: "card-1", image_path: "owner/image.webp" }], { signer: client }))
            .rejects.toBeInstanceOf(CardMediaSigningError);
    });

    it("does not accept URL-like or traversal storage values even when they appear in a row", async () => {
        expect(isSafeCardMediaStoragePath("legacy-image.webp")).toBe(true);
        expect(isSafeCardMediaStoragePath("owner/image.webp")).toBe(true);
        expect(isSafeCardMediaStoragePath("../other-user/file.webp")).toBe(false);
        expect(isSafeCardMediaStoragePath("https://example.test/file.webp")).toBe(false);

        await expect(signAuthorizedCardMediaUrls([{ id: "card-1", image_path: "../other-user/file.webp" }], { signer: signer() }))
            .rejects.toBeInstanceOf(CardMediaSigningError);
    });
});
