import { describe, expect, it, vi } from "vitest";
import { CARD_DEPENDENT_TABLES, deleteOwnedCards } from "./deleteCards";

type Row = { id: string; image_path?: string | null; audio_path?: string | null };

function backend(input: {
    owned?: Row[];
    deletedIds?: string[];
    cardDeleteError?: { code?: string; message?: string };
    dependentError?: { table: string; error: { code?: string; message?: string } };
    storageError?: Record<string, { code?: string; message?: string }>;
} = {}) {
    const owned = input.owned ?? [];
    const dependentDeletes: string[] = [];
    const storageRemoves: Array<{ bucket: string; paths: string[] }> = [];

    const client = {
        from(table: string) {
            if (table === "cards") {
                return {
                    select: () => ({ eq: () => ({ in: async () => ({ data: owned, error: null }) }) }),
                    delete: () => ({
                        eq: () => ({
                            in: () => ({
                                select: async () => ({
                                    data: (input.deletedIds ?? owned.map((row) => row.id)).map((id) => ({ id })),
                                    error: input.cardDeleteError ?? null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            return {
                delete: () => ({ eq: () => ({ in: async () => {
                    dependentDeletes.push(table);
                    return { error: input.dependentError?.table === table ? input.dependentError.error : null };
                } }) }),
            };
        },
        storage: {
            from(bucket: string) {
                return { remove: async (paths: string[]) => {
                    storageRemoves.push({ bucket, paths });
                    return { error: input.storageError?.[bucket] ?? null };
                } };
            },
        },
    };
    return { client, dependentDeletes, storageRemoves };
}

describe("deleteOwnedCards", () => {
    it("deletes only owned cards and returns the exact partial bulk result", async () => {
        const fake = backend({ owned: [{ id: "own" }] });
        const result = await deleteOwnedCards({ supabase: fake.client, userId: "user-1", cardIds: ["own", "foreign"], imageBucket: "card-images" });
        expect(result).toMatchObject({ ok: true, deletedIds: ["own"], skippedCount: 1 });
        expect(fake.dependentDeletes).toEqual(CARD_DEPENDENT_TABLES);
        expect(fake.dependentDeletes).not.toContain("learn_sessions");
    });

    it("does not mutate anything when no requested card belongs to the user", async () => {
        const fake = backend();
        const result = await deleteOwnedCards({ supabase: fake.client, userId: "user-1", cardIds: ["foreign"], imageBucket: "card-images" });
        expect(result).toMatchObject({ ok: true, deletedIds: [], skippedCount: 1 });
        expect(fake.dependentDeletes).toEqual([]);
        expect(fake.storageRemoves).toEqual([]);
    });

    it("cleans image and audio objects only after their own card was deleted", async () => {
        const fake = backend({ owned: [{ id: "1", image_path: "user-1/image.webp", audio_path: "user-1/1-1.webm" }] });
        const result = await deleteOwnedCards({ supabase: fake.client, userId: "user-1", cardIds: ["1"], imageBucket: "card-images" });
        expect(result).toMatchObject({ ok: true, warnings: [] });
        expect(fake.storageRemoves).toEqual([
            { bucket: "card-images", paths: ["user-1/image.webp"] },
            { bucket: "card-audio", paths: ["user-1/1-1.webm"] },
        ]);
    });

    it.each([
        [{ image_path: "user-1/image.webp" }, "card-images"],
        [{ audio_path: "user-1/1-1.webm" }, "card-audio"],
    ])("cleans a card with one media type", async (media, expectedBucket) => {
        const fake = backend({ owned: [{ id: "1", ...media }] });
        await deleteOwnedCards({ supabase: fake.client, userId: "user-1", cardIds: ["1"], imageBucket: "card-images" });
        expect(fake.storageRemoves).toHaveLength(1);
        expect(fake.storageRemoves[0].bucket).toBe(expectedBucket);
    });

    it("does not call storage for a card without media", async () => {
        const fake = backend({ owned: [{ id: "1", image_path: null, audio_path: null }] });
        await deleteOwnedCards({ supabase: fake.client, userId: "user-1", cardIds: ["1"], imageBucket: "card-images" });
        expect(fake.storageRemoves).toEqual([]);
    });

    it("keeps a successful DB delete successful when storage cleanup fails", async () => {
        const logger = { warn: vi.fn(), error: vi.fn() };
        const fake = backend({
            owned: [{ id: "1", image_path: "user-1/image.webp" }],
            storageError: { "card-images": { code: "storage_down" } },
        });
        const result = await deleteOwnedCards({ supabase: fake.client, userId: "user-1", cardIds: ["1"], imageBucket: "card-images", logger });
        expect(result).toMatchObject({ ok: true, deletedIds: ["1"], warnings: ["image_cleanup_failed"] });
        expect(logger.warn).toHaveBeenCalled();
    });

    it("also converts a thrown storage transport failure into a cleanup warning", async () => {
        const fake = backend({ owned: [{ id: "1", audio_path: "user-1/1-1.webm" }] });
        fake.client.storage.from = () => ({ remove: async () => { throw new Error("offline"); } });
        const result = await deleteOwnedCards({
            supabase: fake.client,
            userId: "user-1",
            cardIds: ["1"],
            imageBucket: "card-images",
            logger: { warn: vi.fn(), error: vi.fn() },
        });
        expect(result).toMatchObject({ ok: true, deletedIds: ["1"], warnings: ["audio_cleanup_failed"] });
    });

    it("never removes dependencies or storage if the authoritative card delete fails", async () => {
        const fake = backend({ owned: [{ id: "1", image_path: "user-1/image.webp" }], cardDeleteError: { code: "db_down" } });
        const result = await deleteOwnedCards({ supabase: fake.client, userId: "user-1", cardIds: ["1"], imageBucket: "card-images", logger: { warn: vi.fn(), error: vi.fn() } });
        expect(result).toMatchObject({ ok: false, status: 500 });
        expect(fake.dependentDeletes).toEqual([]);
        expect(fake.storageRemoves).toEqual([]);
    });

    it("reports relational cleanup failures without claiming the deleted card returned", async () => {
        const fake = backend({ owned: [{ id: "1" }], dependentError: { table: "card_notes", error: { code: "db_down" } } });
        const result = await deleteOwnedCards({ supabase: fake.client, userId: "user-1", cardIds: ["1"], imageBucket: "card-images", logger: { warn: vi.fn(), error: vi.fn() } });
        expect(result).toMatchObject({ ok: true, deletedIds: ["1"], warnings: ["relational_cleanup_failed"] });
    });
});
