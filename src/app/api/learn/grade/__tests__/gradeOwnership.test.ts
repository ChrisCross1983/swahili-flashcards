import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
    cards: new Set<string>(),
    writes: [] as Record<string, unknown>[],
    cardLookupError: null as { code: string } | null,
    from: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
    requireUser: async () => ({ user: { id: "user-a" }, response: null }),
}));

vi.mock("@/lib/supabaseServer", () => ({
    supabaseServer: { from: (table: string) => fixture.from(table) },
}));

import { POST } from "@/app/api/learn/grade/route";

function request(body: unknown) {
    return new Request("http://localhost/api/learn/grade", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    fixture.cards.clear();
    fixture.writes.length = 0;
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
        if (table === "card_progress") {
            return {
                upsert: (row: Record<string, unknown>) => {
                    fixture.writes.push(row);
                    return { select: async () => ({ data: [row], error: null }) };
                },
            };
        }
        throw new Error(`unexpected table ${table}`);
    });
});

describe("grade card ownership", () => {
    it("writes progress only for the authenticated user's card", async () => {
        fixture.cards.add("user-a:card-a");

        const response = await POST(request({ cardId: "card-a", correct: true, currentLevel: 0 }));

        expect(response.status).toBe(200);
        expect(fixture.writes).toHaveLength(1);
        expect(fixture.writes[0]).toMatchObject({ owner_key: "user-a", card_id: "card-a" });
    });

    it("rejects a foreign card without writing progress", async () => {
        fixture.cards.add("user-b:foreign-card");

        const response = await POST(request({ cardId: "foreign-card", correct: true, currentLevel: 0 }));

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: "Card not found." });
        expect(fixture.writes).toEqual([]);
    });

    it("uses the same non-enumerating response for a missing card", async () => {
        const response = await POST(request({ cardId: "missing-card", correct: true, currentLevel: 0 }));

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: "Card not found." });
        expect(fixture.writes).toEqual([]);
    });

    it("rejects invalid card ids before any database write", async () => {
        const response = await POST(request({ cardId: "not a valid id", correct: true, currentLevel: 0 }));

        expect(response.status).toBe(400);
        expect(fixture.writes).toEqual([]);
        expect(fixture.from).not.toHaveBeenCalledWith("card_progress");
    });

    it("fails closed when ownership verification is unavailable", async () => {
        fixture.cardLookupError = { code: "XX000" };

        const response = await POST(request({ cardId: "card-a", correct: true, currentLevel: 0 }));

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({ error: "Card verification failed." });
        expect(fixture.writes).toEqual([]);
    });
});
