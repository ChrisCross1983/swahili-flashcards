import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    notes: vi.fn(),
    groups: vi.fn(),
    word: vi.fn(),
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
                select: () => query,
                eq: () => query,
                or: () => query,
                order: async () => ({ data: [{ id: "test-card", type: "vocab" }], error: null }),
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
});
