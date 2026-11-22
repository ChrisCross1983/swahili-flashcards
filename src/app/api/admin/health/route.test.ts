import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
    admin: vi.fn(), overview: vi.fn(), exportReport: vi.fn(), events: vi.fn(), runs: vi.fn(), run: vi.fn(), runEvents: vi.fn(), identity: vi.fn(),
}));
vi.mock("@/lib/admin/requireAdmin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/admin/healthData", () => ({
    getHealthOverview: mocks.overview, getHealthExport: mocks.exportReport, getEventsPage: mocks.events, getRunsPage: mocks.runs,
    getRun: mocks.run, getRunEventsPage: mocks.runEvents, getUserIdentity: mocks.identity,
}));

import { GET as overview } from "./overview/route";
import { GET as events } from "./events/route";
import { GET as runs } from "./runs/route";
import { GET as user } from "./users/[userId]/route";
import { GET as runDetail } from "./runs/[runId]/route";
import { GET as exportHealth } from "./export/route";

const userId = "a3429d20-9335-4900-93d3-18df8e796704";
const runId = "ad0fa83f-e3c5-4cc1-8843-e0f12b355f28";
const request = (path: string) => new Request(`https://example.test${path}`);
const userContext = (id = userId) => ({ params: Promise.resolve({ userId: id }) });
const runContext = (id = runId) => ({ params: Promise.resolve({ runId: id }) });

describe("admin health endpoints", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.admin.mockResolvedValue({ user: { id: userId }, response: null });
        mocks.overview.mockResolvedValue({ metrics: { errors: 0 } });
        mocks.events.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
        mocks.runs.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
        mocks.run.mockResolvedValue({ run_id: runId, user_id: userId });
        mocks.runEvents.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
        mocks.identity.mockResolvedValue({ id: userId, email: "admin@example.test", display_name: "Admin" });
        mocks.exportReport.mockResolvedValue({ events: { total: 0, returned: 0, limit: 500, truncated: false, items: [] }, runs: { total: 0, returned: 0, limit: 500, truncated: false, items: [] } });
    });
    it("guards each endpoint independently for anonymous and ordinary users", async () => {
        const paths = [
            () => overview(request("/api/admin/health/overview")),
            () => events(request("/api/admin/health/events")),
            () => runs(request("/api/admin/health/runs")),
            () => user(request(`/api/admin/health/users/${userId}`), userContext()),
            () => runDetail(request(`/api/admin/health/runs/${runId}`), runContext()),
            () => exportHealth(request("/api/admin/health/export")),
        ];
        for (const status of [401, 403]) {
            mocks.admin.mockResolvedValue({ user: null, response: NextResponse.json({ code: "denied" }, { status }) });
            for (const call of paths) expect((await call()).status).toBe(status);
        }
        expect(mocks.overview).not.toHaveBeenCalled();
        expect(mocks.events).not.toHaveBeenCalled();
        expect(mocks.run).not.toHaveBeenCalled();
    });
    it("returns bounded overview and list pages for an admin", async () => {
        expect((await overview(request("/api/admin/health/overview?period=7d"))).status).toBe(200);
        expect((await events(request(`/api/admin/health/events?period=today&page=2&pageSize=10&userId=${userId}`))).status).toBe(200);
        expect(mocks.events).toHaveBeenCalledWith(expect.objectContaining({ period: "today" }), { page: 2, pageSize: 10, offset: 10 }, userId);
        expect((await runs(request("/api/admin/health/runs?period=30d"))).status).toBe(200);
        expect((await events(request("/api/admin/health/events?pageSize=500"))).status).toBe(400);
        expect((await overview(request("/api/admin/health/overview?period=all"))).status).toBe(400);
    });
    it("correlates user pages and run events with the owner, with pagination", async () => {
        const response = await user(request(`/api/admin/health/users/${userId}?eventPage=2&runPage=3`), userContext());
        expect(response.status).toBe(200);
        expect((await response.json()).user).toEqual({ id: userId, email: "admin@example.test", display_name: "Admin" });
        expect(mocks.events).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ page: 2 }), userId);
        expect(mocks.runs).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ page: 3 }), userId);
        const detail = await runDetail(request(`/api/admin/health/runs/${runId}?page=2`), runContext());
        expect(detail.status).toBe(200);
        expect(mocks.runEvents).toHaveBeenCalledWith(runId, userId, expect.objectContaining({ page: 2 }));
        expect((await runDetail(request(`/api/admin/health/runs/${runId}?userId=bd0fa83f-e3c5-4cc1-8843-e0f12b355f28`), runContext())).status).toBe(404);
        mocks.run.mockResolvedValue(null);
        expect((await runDetail(request(`/api/admin/health/runs/${runId}`), runContext())).status).toBe(404);
        expect((await user(request("/api/admin/health/users/bad"), userContext("bad"))).status).toBe(400);
        mocks.identity.mockResolvedValue(null);
        expect((await user(request(`/api/admin/health/users/${userId}`), userContext())).status).toBe(404);
    });
    it("exports only the validated period and optional user scope with a transparent server cap", async () => {
        const response = await exportHealth(request(`/api/admin/health/export?period=7d&userId=${userId}`));
        expect(response.status).toBe(200);
        expect(mocks.exportReport).toHaveBeenCalledWith(expect.objectContaining({ period: "7d" }), userId);
        const body = await response.json();
        expect(body.meta).toMatchObject({ timezone: "UTC" });
        expect(body.events).toMatchObject({ limit: 500, truncated: false });
        expect((await exportHealth(request("/api/admin/health/export?userId=bad"))).status).toBe(400);
    });
    it("does not expose query errors to the browser", async () => {
        mocks.overview.mockRejectedValue(new Error("sensitive database detail"));
        const response = await overview(request("/api/admin/health/overview"));
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("sensitive database detail");
        mocks.exportReport.mockRejectedValue(new Error("sensitive export detail"));
        const exportResponse = await exportHealth(request("/api/admin/health/export"));
        expect(exportResponse.status).toBe(503);
        expect(await exportResponse.text()).not.toContain("sensitive export detail");
    });
});
