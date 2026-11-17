import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/admin/requireAdmin", () => ({ requireAdmin: mocks.admin }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
import AdminHealthPage from "./page";

describe("admin health page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.redirect.mockImplementation(() => { throw new Error("redirected"); });
        mocks.notFound.mockImplementation(() => { throw new Error("not_found"); });
    });
    it("redirects anonymous visitors to login", async () => {
        mocks.admin.mockResolvedValue({ user: null, response: NextResponse.json({}, { status: 401 }) });
        await expect(AdminHealthPage()).rejects.toThrow("redirected");
        expect(mocks.redirect).toHaveBeenCalledWith("/login");
    });
    it("hides the page from ordinary users", async () => {
        mocks.admin.mockResolvedValue({ user: null, response: NextResponse.json({}, { status: 403 }) });
        await expect(AdminHealthPage()).rejects.toThrow("not_found");
        expect(mocks.notFound).toHaveBeenCalled();
    });
    it("renders only after the server guard accepts an enabled admin", async () => {
        mocks.admin.mockResolvedValue({ user: { id: "a3429d20-9335-4900-93d3-18df8e796704" }, response: null });
        const page = await AdminHealthPage();
        expect(page.props.currentAdminId).toBe("a3429d20-9335-4900-93d3-18df8e796704");
    });
});
