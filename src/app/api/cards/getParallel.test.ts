import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    notes: vi.fn(),
    groups: vi.fn(),
    word: vi.fn(),
    not: vi.fn(),
    range: vi.fn(),
    select: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ requireUser: async () => ({ user: { id: "test-owner" }, response: null }) }));
vi.mock("@/lib/diagnostics/server", () => ({
    withServerDiagnostics: (_route: string, handler: (req: Request, diagnostics: unknown) => Promise<Response>) =>
        (req: Request) => handler(req, { setUser: vi.fn(), supabaseFailure: vi.fn() }),
}));
vi.mock("@/lib/supabaseServer", () => ({
    supabaseServer: {
        from: () => {
            const query = {
                select: (...args: unknown[]) => { mocks.select(...args); return query; },
                eq: () => query,
                or: () => query,
                not: (...args: unknown[]) => { mocks.not(...args); return query; },
                is: () => query,
                order: () => query,
                range: (...args: unknown[]) => { mocks.range(...args); return Promise.resolve({ data: [{ id: "test-card", type: "vocab" }], error: null, count: 1 }); },
                then: (resolve: (value: unknown) => unknown) => resolve({ data: [{ id: "test-card", type: "vocab" }], error: null, count: 1 }),
            };
            return query;
        },
    },
}));
vi.mock("@/lib/server/cardFilters", () => ({
    applyCardTypeFilter: (query: unknown) => query,
    getAllowedCardIdsByGroups: async () => null,
    getCardGroups: mocks.groups,
    parseGroupIds: () => [],
    resolveCardTypeFilter: () => "vocab",
}));
vi.mock("@/lib/server/cardNoteStatus", () => ({ getCardNotes: mocks.notes, hasCardNote: () => false }));
vi.mock("@/lib/server/wordUnderstandingStatus", () => ({ getWordUnderstandingByCard: mocks.word }));

import { GET } from "./route";

describe("GET /api/cards enrichment", () => {
    beforeEach(() => {
        mocks.notes.mockReset();
        mocks.groups.mockReset();
        mocks.word.mockReset();
        mocks.not.mockReset();
        mocks.range.mockReset();
        mocks.select.mockReset();
    });

    it("starts independent note, group and word reads together", async () => {
        const finish: Array<(value: Map<string, unknown>) => void> = [];
        for (const mock of [mocks.notes, mocks.groups, mocks.word]) {
            mock.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
        }

        const responsePromise = GET(new Request("http://localhost/api/cards?type=vocab"));
        await vi.waitFor(() => expect(finish).toHaveLength(3));
        finish.forEach((resolve) => resolve(new Map()));

        const response = await responsePromise;
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ cards: [{ id: "test-card" }] });
    });

    it("applies media, search pagination, and sorting on the owner-scoped server query", async () => {
        mocks.notes.mockResolvedValue(new Map());
        mocks.groups.mockResolvedValue(new Map());
        mocks.word.mockResolvedValue(new Map());

        const response = await GET(new Request("http://localhost/api/cards?type=vocab&media=with-image&sort=az&limit=50&offset=0&q=haus"));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ cards: [{ id: "test-card" }], total: 1 });
        expect(mocks.not).toHaveBeenCalledWith("image_path", "is", null);
        expect(mocks.range).toHaveBeenCalledWith(0, 49);
        expect(mocks.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    });
});
