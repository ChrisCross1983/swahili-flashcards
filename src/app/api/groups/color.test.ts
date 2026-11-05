import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, from } = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));
import { POST } from "./route";
import { PATCH } from "./[id]/route";

const request = (method: string, url: string, body: unknown) => new Request(url, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const owner = "123e4567-e89b-12d3-a456-426614174111";

describe("group color API", () => {
    let inserted: Record<string, unknown>[];
    let updated: Record<string, unknown>[];
    beforeEach(() => {
        requireUser.mockResolvedValue({ user: { id: owner }, response: null });
        inserted = []; updated = [];
        from.mockClear();
        from.mockImplementation(() => ({
            select: () => ({ eq: async () => ({ data: [], error: null }) }),
            insert: (row: Record<string, unknown>) => {
                inserted.push(row);
                return { select: () => ({ single: async () => ({ data: { id: "g1", ...row }, error: null }) }) };
            },
            update: (patch: Record<string, unknown>) => {
                updated.push(patch);
                const query = { eq: () => query, or: () => query, select: () => query,
                    maybeSingle: async () => ({ data: { id: "g1", name: "Alltag", color: patch.color ?? null }, error: null }) };
                return query;
            },
        }));
    });

    it("creates groups without a color or with a curated key", async () => {
        expect((await POST(request("POST", "http://localhost/api/groups", { name: "Neutral", type: "sentence" }))).status).toBe(201);
        expect(inserted[0].color).toBeNull();
        expect((await POST(request("POST", "http://localhost/api/groups", { name: "Alltag", type: "sentence", color: "sage" }))).status).toBe(201);
        expect(inserted[1].color).toBe("sage");
    });

    it("changes only the color of an existing group", async () => {
        const response = await PATCH(request("PATCH", "http://localhost/api/groups/g1", { type: "sentence", color: "blue" }), { params: Promise.resolve({ id: "g1" }) });
        expect(response.status).toBe(200);
        const clear = await PATCH(request("PATCH", "http://localhost/api/groups/g1", { type: "sentence", color: null }), { params: Promise.resolve({ id: "g1" }) });
        expect(clear.status).toBe(200);
        expect(updated).toEqual([{ color: "blue" }, { color: null }]);
        expect(from.mock.calls.map(([table]) => table)).toEqual(["groups", "groups"]);
    });

    it("rejects arbitrary hex and unknown values before a database write", async () => {
        expect((await POST(request("POST", "http://localhost/api/groups", { name: "Bad", color: "#ff0000" }))).status).toBe(400);
        expect((await PATCH(request("PATCH", "http://localhost/api/groups/g1", { color: "neon" }), { params: Promise.resolve({ id: "g1" }) })).status).toBe(400);
        expect(inserted).toHaveLength(0);
        expect(updated).toHaveLength(0);
    });
});
