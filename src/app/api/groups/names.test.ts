import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, from } = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));
import { GET, POST } from "./route";
import { DELETE, PATCH } from "./[id]/route";

const owner = "owner-1";
const request = (method: string, url: string, body: unknown) => new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

describe("group name conflicts", () => {
    let existing: Array<{ id: string; name: string }>;
    let insertError: { code?: string; message: string } | null;
    let updateError: { code?: string; message: string } | null;
    let deleteError: { code?: string; message: string } | null;
    const inserted: string[] = [];

    beforeEach(() => {
        requireUser.mockResolvedValue({ user: { id: owner }, response: null });
        existing = [{ id: "g1", name: "Testgruppe" }, { id: "g2", name: "Testgruppe 2" }];
        insertError = null;
        updateError = null;
        deleteError = null;
        inserted.length = 0;
        from.mockReset();
        from.mockImplementation(() => ({
            select: () => {
                const query = {
                    eq: () => query,
                    order: () => query,
                    or: () => query,
                    then: (resolve: (result: { data: typeof existing; error: null }) => void) => resolve({ data: existing, error: null }),
                };
                return query;
            },
            insert: (row: { name: string }) => {
                inserted.push(row.name);
                return { select: () => ({ single: async () => ({ data: insertError ? null : { id: "new", ...row }, error: insertError }) }) };
            },
            update: (patch: { name?: string }) => {
                const query = {
                    eq: () => query,
                    or: () => query,
                    select: () => query,
                    maybeSingle: async () => ({ data: updateError ? null : { id: "g1", name: patch.name ?? "Testgruppe" }, error: updateError }),
                };
                return query;
            },
            delete: () => {
                const query = { eq: () => query, then: (resolve: (result: { error: typeof deleteError }) => void) => resolve({ error: deleteError }) };
                return query;
            },
        }));
    });

    it("creates Test alongside Testgruppe and Testgruppe 2", async () => {
        const res = await POST(request("POST", "http://localhost/api/groups", { name: " Test ", type: "sentence" }));
        expect(res.status).toBe(201);
        expect(inserted).toEqual(["Test"]);
    });

    it("rejects a case and whitespace equivalent name before insert", async () => {
        existing = [{ id: "g1", name: "Test Gruppe" }];
        const res = await POST(request("POST", "http://localhost/api/groups", { name: "  test   gruppe ", type: "sentence" }));
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ error: "group_name_exists" });
        expect(inserted).toHaveLength(0);
    });

    it("maps a database uniqueness race to a safe conflict code", async () => {
        insertError = { code: "23505", message: 'duplicate key value violates unique constraint "idx_groups_owner_name"' };
        const res = await POST(request("POST", "http://localhost/api/groups", { name: "Test", type: "sentence" }));
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ error: "group_name_exists" });
    });

    it("handles rename conflicts while allowing the current name", async () => {
        existing = [{ id: "g1", name: "Testgruppe" }, { id: "g2", name: "Arbeit" }];
        const conflict = await PATCH(request("PATCH", "http://localhost/api/groups/g1", { name: "  ARBEIT " }), { params: Promise.resolve({ id: "g1" }) });
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toEqual({ error: "group_name_exists" });
        const ownName = await PATCH(request("PATCH", "http://localhost/api/groups/g1", { name: " Testgruppe " }), { params: Promise.resolve({ id: "g1" }) });
        expect(ownName.status).toBe(200);
    });

    it("maps a database uniqueness race during rename to a safe conflict code", async () => {
        updateError = { code: "23505", message: 'duplicate key value violates unique constraint "idx_groups_owner_name"' };
        const res = await PATCH(request("PATCH", "http://localhost/api/groups/g1", { name: "Test" }), { params: Promise.resolve({ id: "g1" }) });
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ error: "group_name_exists" });
    });

    it("keeps listing and deleting existing groups available", async () => {
        const list = await GET(new Request("http://localhost/api/groups?type=sentence"));
        expect(list.status).toBe(200);
        const deleted = await DELETE(new Request("http://localhost/api/groups/g1", { method: "DELETE" }), { params: Promise.resolve({ id: "g1" }) });
        expect(deleted.status).toBe(200);
    });

    it("does not expose unknown database errors", async () => {
        insertError = { code: "XX000", message: "sensitive internal database detail" };
        const res = await POST(request("POST", "http://localhost/api/groups", { name: "Test", type: "sentence" }));
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain("sensitive internal database detail");
        updateError = { code: "XX000", message: "sensitive internal database detail" };
        const patch = await PATCH(request("PATCH", "http://localhost/api/groups/g1", { name: "Anders" }), { params: Promise.resolve({ id: "g1" }) });
        expect(patch.status).toBe(500);
        expect(JSON.stringify(await patch.json())).not.toContain("sensitive internal database detail");
    });
});
