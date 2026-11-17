import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from: mocks.from } }));
import { requireAdmin } from "./requireAdmin";

const user = { id: "a3429d20-9335-4900-93d3-18df8e796704" };
function membership(value: unknown, error: unknown = null) {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: value, error }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    return query;
}

describe("server-side admin guard", () => {
    beforeEach(() => { vi.clearAllMocks(); });
    it("rejects anonymous requests before service-role membership lookup", async () => {
        mocks.auth.mockResolvedValue({ user: null, response: NextResponse.json({ code: "auth_required" }, { status: 401 }) });
        expect((await requireAdmin()).response?.status).toBe(401);
        expect(mocks.from).not.toHaveBeenCalled();
    });
    it("rejects ordinary and disabled users", async () => {
        mocks.auth.mockResolvedValue({ user, response: null });
        membership(null);
        expect((await requireAdmin()).response?.status).toBe(403);
        const query = membership({ user_id: user.id, enabled: false });
        expect((await requireAdmin()).response?.status).toBe(403);
        expect(mocks.from).toHaveBeenCalledWith("app_admin_members");
        expect(query.eq).toHaveBeenCalledWith("user_id", user.id);
        expect(query.eq).toHaveBeenCalledWith("enabled", true);
    });
    it("accepts only an enabled member and fails closed on query errors", async () => {
        mocks.auth.mockResolvedValue({ user, response: null });
        membership({ user_id: user.id, enabled: true });
        expect((await requireAdmin()).user).toBe(user);
        membership(null, { message: "unavailable" });
        expect((await requireAdmin()).response?.status).toBe(503);
    });
});
