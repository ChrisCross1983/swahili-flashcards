import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), getUserById: vi.fn() }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from: mocks.from, auth: { admin: { getUserById: mocks.getUserById } } } }));
import { getEventsPage, getRunEventsPage, getRunsPage, getUserIdentity } from "./healthData";

const window = { from: "2026-11-10T00:00:00.000Z", to: "2026-11-17T00:00:00.000Z", label: "7d UTC", period: "7d" as const };
const userId = "a3429d20-9335-4900-93d3-18df8e796704";
const runId = "ad0fa83f-e3c5-4cc1-8843-e0f12b355f28";
const page = { page: 2, pageSize: 25, offset: 25 };

function query() {
    const builder = { select: vi.fn(), gte: vi.fn(), lt: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
    for (const key of ["select", "gte", "lt", "eq", "order"] as const) builder[key].mockReturnValue(builder);
    builder.range.mockResolvedValue({ data: [], error: null, count: 51 });
    mocks.from.mockReturnValue(builder);
    return builder;
}

describe("admin health queries", () => {
    beforeEach(() => vi.clearAllMocks());
    it("limits event and run queries to the validated UTC window and page", async () => {
        const events = query();
        expect((await getEventsPage(window, page, userId)).total).toBe(51);
        expect(mocks.from).toHaveBeenCalledWith("app_diagnostic_events");
        expect(events.gte).toHaveBeenCalledWith("occurred_at", window.from);
        expect(events.lt).toHaveBeenCalledWith("occurred_at", window.to);
        expect(events.eq).toHaveBeenCalledWith("user_id", userId);
        expect(events.range).toHaveBeenCalledWith(25, 49);
        const runs = query();
        await getRunsPage(window, page, userId);
        expect(mocks.from).toHaveBeenCalledWith("learning_run_health");
        expect(runs.gte).toHaveBeenCalledWith("started_at", window.from);
        expect(runs.lt).toHaveBeenCalledWith("started_at", window.to);
        expect(runs.eq).toHaveBeenCalledWith("user_id", userId);
        expect(runs.range).toHaveBeenCalledWith(25, 49);
    });
    it("links run events by both run and owner, with pagination", async () => {
        const builder = query();
        await getRunEventsPage(runId, userId, page);
        expect(builder.eq).toHaveBeenCalledWith("run_id", runId);
        expect(builder.eq).toHaveBeenCalledWith("user_id", userId);
        expect(builder.range).toHaveBeenCalledWith(25, 49);
    });
    it("uses the server admin API for a selected user's email", async () => {
        mocks.getUserById.mockResolvedValue({ data: { user: { id: userId, email: "user@example.test" } }, error: null });
        expect(await getUserIdentity(userId)).toEqual({ id: userId, email: "user@example.test" });
        mocks.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 404 } });
        expect(await getUserIdentity(userId)).toBeNull();
        mocks.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 503, message: "secret" } });
        await expect(getUserIdentity(userId)).rejects.toThrow("health_query_failed");
    });
});
