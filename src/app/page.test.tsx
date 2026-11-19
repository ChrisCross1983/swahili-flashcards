import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ server: vi.fn(), membership: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: mocks.server }));
vi.mock("@/lib/admin/requireAdmin", () => ({ checkAdminMembership: mocks.membership }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import HomePage from "./page";

describe("server-side Home admin navigation flag", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.server.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) } });
    });
    it("passes only an enabled membership to the client", async () => {
        mocks.membership.mockResolvedValueOnce({ enabled: true, error: false }).mockResolvedValueOnce({ enabled: false, error: false });
        expect((await HomePage()).props.isAdmin).toBe(true);
        expect((await HomePage()).props.isAdmin).toBe(false);
        expect(mocks.membership).toHaveBeenCalledWith("test-user");
    });
    it("fails closed without breaking Home when membership lookup is unavailable", async () => {
        mocks.membership.mockRejectedValue(new Error("unavailable"));
        expect((await HomePage()).props.isAdmin).toBe(false);
    });
});
