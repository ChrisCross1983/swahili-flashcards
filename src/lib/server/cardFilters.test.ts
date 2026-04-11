import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseServer", () => ({
    supabaseServer: {},
}));

let applyCardTypeFilter: typeof import("@/lib/server/cardFilters").applyCardTypeFilter;
let applyGroupTypeScopeFilter: typeof import("@/lib/server/cardFilters").applyGroupTypeScopeFilter;
let getCardGroups: typeof import("@/lib/server/cardFilters").getCardGroups;
let __internal: typeof import("@/lib/server/cardFilters").__internal;
let supabaseServer: any;

beforeAll(async () => {
    const mod = await import("@/lib/server/cardFilters");
    applyCardTypeFilter = mod.applyCardTypeFilter;
    applyGroupTypeScopeFilter = mod.applyGroupTypeScopeFilter;
    getCardGroups = mod.getCardGroups;
    __internal = mod.__internal;
    supabaseServer = (await import("@/lib/supabaseServer")).supabaseServer as any;
});

function createRecorder() {
    const calls: Array<{ fn: "eq" | "or"; args: any[] }> = [];
    const query = {
        eq(...args: any[]) {
            calls.push({ fn: "eq", args });
            return query;
        },
        or(...args: any[]) {
            calls.push({ fn: "or", args });
            return query;
        },
    };
    return { query, calls };
}

describe("applyCardTypeFilter", () => {
    it("filters sentence queries by exact sentence type", () => {
        const { query, calls } = createRecorder();
        applyCardTypeFilter(query, "sentence");
        expect(calls).toEqual([{ fn: "eq", args: ["type", "sentence"] }]);
    });

    it("filters vocab queries with legacy null + vocab compatibility", () => {
        const { query, calls } = createRecorder();
        applyCardTypeFilter(query, "vocab");
        expect(calls).toEqual([{ fn: "or", args: ["type.is.null,type.eq.vocab"] }]);
    });
});

describe("applyGroupTypeScopeFilter", () => {
    it("keeps sentence flows isolated from vocab groups", () => {
        const { query, calls } = createRecorder();
        applyGroupTypeScopeFilter(query, "sentence", { foreignTable: "groups" });
        expect(calls).toEqual([{ fn: "eq", args: ["groups.type_scope", "sentence"] }]);
    });

    it("keeps vocab flows on vocab (plus null during migration rollout)", () => {
        const { query, calls } = createRecorder();
        applyGroupTypeScopeFilter(query, "vocab", { foreignTable: "groups" });
        expect(calls).toEqual([
            { fn: "or", args: ["type_scope.is.null,type_scope.eq.vocab", { foreignTable: "groups" }] },
        ]);
    });
});

describe("getCardGroups", () => {
    it("chunks large card id lists so group enrichment works for large libraries", async () => {
        const ownerKey = "owner-1";
        const cardIds = Array.from({ length: __internal.CARD_GROUPS_BATCH_SIZE * 2 + 1 }, (_, index) => `card-${index + 1}`);
        const seenChunks: string[][] = [];

        supabaseServer.from = vi.fn(() => {
            let currentChunk: string[] = [];
            const query = {
                select: vi.fn(() => query),
                eq: vi.fn(() => query),
                in: vi.fn((_column: string, ids: string[]) => {
                    seenChunks.push(ids);
                    currentChunk = ids;
                    return query;
                }),
                or: vi.fn(() => query),
                then: (resolve: (value: { data: any[]; error: null }) => void) => resolve({
                    data: currentChunk.map((cardId) => ({
                        card_id: cardId,
                        groups: { id: `group-${cardId}`, name: `Group ${cardId}`, color: null },
                    })),
                    error: null,
                }),
            };

            return query;
        });

        const groupsByCard = await getCardGroups(ownerKey, cardIds, "vocab");

        expect(seenChunks).toHaveLength(3);
        expect(seenChunks[0]).toHaveLength(__internal.CARD_GROUPS_BATCH_SIZE);
        expect(seenChunks[1]).toHaveLength(__internal.CARD_GROUPS_BATCH_SIZE);
        expect(seenChunks[2]).toHaveLength(1);
        expect(groupsByCard.size).toBe(cardIds.length);
        expect(groupsByCard.get("card-1")?.[0]).toEqual({ id: "group-card-1", name: "Group card-1", color: null });
    });
});
