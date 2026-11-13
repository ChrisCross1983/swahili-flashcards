import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, deleteOwnedCards } = vi.hoisted(() => ({ requireUser: vi.fn(), deleteOwnedCards: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/server/deleteCards", () => ({ deleteOwnedCards }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: {} }));

import { DELETE } from "./route";

describe("shared card delete route", () => {
    beforeEach(() => {
        requireUser.mockResolvedValue({ user: { id: "user-1" }, response: null });
        deleteOwnedCards.mockReset();
    });

    it("returns 404 for a foreign or missing single card", async () => {
        deleteOwnedCards.mockResolvedValue({ ok: true, deletedIds: [], skippedCount: 1, warnings: [] });
        const response = await DELETE(new Request("http://localhost/api/cards?id=foreign", { method: "DELETE" }));
        expect(response.status).toBe(404);
        expect(deleteOwnedCards).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", cardIds: ["foreign"] }));
    });

    it("returns the exact ID for an owned single card", async () => {
        deleteOwnedCards.mockResolvedValue({ ok: true, deletedIds: ["own"], skippedCount: 0, warnings: [] });
        const response = await DELETE(new Request("http://localhost/api/cards?id=own", { method: "DELETE" }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ deletedIds: ["own"], skippedCount: 0 });
    });

    it("returns exactly the owned IDs deleted by a partial bulk request", async () => {
        deleteOwnedCards.mockResolvedValue({ ok: true, deletedIds: ["own"], skippedCount: 1, warnings: [] });
        const response = await DELETE(new Request("http://localhost/api/cards", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: ["own", "foreign"] }),
        }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ deletedIds: ["own"], deletedCount: 1, skippedCount: 1 });
    });
});
