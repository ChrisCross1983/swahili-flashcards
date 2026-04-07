import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseServer", () => ({
    supabaseServer: {},
}));

let applyCardTypeFilter: typeof import("@/lib/server/cardFilters").applyCardTypeFilter;
let applyGroupTypeScopeFilter: typeof import("@/lib/server/cardFilters").applyGroupTypeScopeFilter;

beforeAll(async () => {
    const mod = await import("@/lib/server/cardFilters");
    applyCardTypeFilter = mod.applyCardTypeFilter;
    applyGroupTypeScopeFilter = mod.applyGroupTypeScopeFilter;
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
