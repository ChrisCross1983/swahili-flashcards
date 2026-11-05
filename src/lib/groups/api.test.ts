import { afterEach, describe, expect, it, vi } from "vitest";
import { createGroup, updateGroup } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("group API error messages", () => {
    it("shows a friendly duplicate message for the controlled conflict", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "group_name_exists" }), { status: 409 })));
        await expect(createGroup("sentence", { name: "Test" })).rejects.toThrow("Eine Gruppe mit diesem Namen existiert bereits.");
    });

    it("never displays raw database text for an unknown server error", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'duplicate key value violates unique constraint "idx_groups_owner_name"' }), { status: 500 })));
        await expect(updateGroup("sentence", "g1", { name: "Test" })).rejects.toThrow("Die Gruppe konnte gerade nicht gespeichert werden. Bitte versuche es erneut.");
    });

    it("provides the same friendly fallback on network failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
        await expect(createGroup("sentence", { name: "Test" })).rejects.toThrow("Die Gruppe konnte gerade nicht gespeichert werden. Bitte versuche es erneut.");
    });
});
