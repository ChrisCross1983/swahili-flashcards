import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
    cards: new Set<string>(),
    additions: [] as Record<string, unknown>[],
    removals: [] as Array<[string, string]>,
    cardLookupError: null as { code: string } | null,
    from: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
    requireUser: async () => ({ user: { id: "user-a" }, response: null }),
}));

vi.mock("@/lib/supabaseServer", () => ({
    supabaseServer: { from: (table: string) => fixture.from(table) },
}));

import { POST } from "@/app/api/learn/last-missed/route";

function request(body: unknown) {
    return new Request("http://localhost/api/learn/last-missed", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    fixture.cards.clear();
    fixture.additions.length = 0;
    fixture.removals.length = 0;
    fixture.cardLookupError = null;
    fixture.from.mockReset().mockImplementation((table: string) => {
        if (table === "cards") {
            let cardId = "";
            let ownerKey = "";
            const query = {
                select: () => query,
                eq: (column: string, value: string) => {
                    if (column === "id") cardId = value;
                    if (column === "owner_key") ownerKey = value;
                    return query;
                },
                maybeSingle: async () => ({
                    data: fixture.cards.has(`${ownerKey}:${cardId}`) ? { id: cardId } : null,
                    error: fixture.cardLookupError,
                }),
            };
            return query;
        }
        if (table === "learn_last_missed") {
            let ownerKey = "";
            let cardId = "";
            const query = {
                upsert: async (row: Record<string, unknown>) => {
                    fixture.additions.push(row);
                    return { error: null };
                },
                delete: () => query,
                eq: (column: string, value: string) => {
                    if (column === "owner_key") ownerKey = value;
                    if (column === "card_id") cardId = value;
                    return query;
                },
                then: (resolve: (result: { error: null }) => unknown) => {
                    fixture.removals.push([ownerKey, cardId]);
                    return Promise.resolve(resolve({ error: null }));
                },
            };
            return query;
        }
        throw new Error(`unexpected table ${table}`);
    });
});

describe("last-missed card ownership", () => {
    it("adds an owned card", async () => {
        fixture.cards.add("user-a:card-a");

        const response = await POST(request({ action: "add", cardId: "card-a" }));

        expect(response.status).toBe(200);
        expect(fixture.additions).toEqual([{ owner_key: "user-a", card_id: "card-a" }]);
    });

    it("rejects a foreign card without creating a missed reference", async () => {
        fixture.cards.add("user-b:foreign-card");

        const response = await POST(request({ action: "add", cardId: "foreign-card" }));

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: "Card not found." });
        expect(fixture.additions).toEqual([]);
    });

    it("rejects a missing card with the same response", async () => {
        const response = await POST(request({ action: "add", cardId: "missing-card" }));

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: "Card not found." });
        expect(fixture.additions).toEqual([]);
    });

    it("rejects malformed card ids before the ownership lookup", async () => {
        const response = await POST(request({ action: "add", cardId: "foreign card" }));

        expect(response.status).toBe(400);
        expect(fixture.from).not.toHaveBeenCalledWith("cards");
        expect(fixture.additions).toEqual([]);
    });

    it("rejects malformed JSON as invalid input", async () => {
        const response = await POST(new Request("http://localhost/api/learn/last-missed", {
            method: "POST",
            body: "{",
        }));

        expect(response.status).toBe(400);
        expect(fixture.additions).toEqual([]);
    });

    it("fails closed when ownership verification fails", async () => {
        fixture.cardLookupError = { code: "XX000" };

        const response = await POST(request({ action: "add", cardId: "card-a" }));

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({ error: "Card verification failed." });
        expect(fixture.additions).toEqual([]);
    });

    it("keeps removal owner-scoped without adding an ownership read", async () => {
        const response = await POST(request({ action: "remove", cardId: "card-a" }));

        expect(response.status).toBe(200);
        expect(fixture.removals).toEqual([["user-a", "card-a"]]);
        expect(fixture.from).not.toHaveBeenCalledWith("cards");
    });
});
