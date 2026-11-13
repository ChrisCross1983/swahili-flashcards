import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteOwnedCards } = vi.hoisted(() => ({ deleteOwnedCards: vi.fn() }));
vi.mock("@/lib/server/deleteCards", () => ({ deleteOwnedCards }));

import { deleteUserDuplicateCards } from "./deleteDuplicates";

describe("deleteUserDuplicateCards", () => {
    beforeEach(() => deleteOwnedCards.mockReset());

    it("delegates duplicate deletion to the shared card delete service", async () => {
        deleteOwnedCards.mockResolvedValue({ ok: true, deletedIds: ["1"], skippedCount: 1, warnings: [] });
        const supabase = { from: vi.fn(), storage: { from: vi.fn(() => ({ remove: vi.fn() })) } };
        const logger = { warn: vi.fn(), error: vi.fn() };

        const result = await deleteUserDuplicateCards({ supabase, userId: "user-1", cardIds: ["1", "foreign"], logger });

        expect(deleteOwnedCards).toHaveBeenCalledWith({ supabase, userId: "user-1", cardIds: ["1", "foreign"], logger });
        expect(result).toMatchObject({ ok: true, deletedIds: ["1"], deletedCount: 1, skippedCount: 1 });
    });

    it("returns the shared service failure unchanged", async () => {
        deleteOwnedCards.mockResolvedValue({ ok: false, status: 500, error: "Karten konnten nicht gelöscht werden." });
        const result = await deleteUserDuplicateCards({
            supabase: { from: vi.fn(), storage: { from: vi.fn(() => ({ remove: vi.fn() })) } },
            userId: "user-1",
            cardIds: ["1"],
        });
        expect(result).toEqual({ ok: false, status: 500, error: "Karten konnten nicht gelöscht werden." });
    });
});
