import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from: mock.from } }));

import { withServerDiagnostics } from "./server";

const userId = "ad0fa83f-e3c5-4cc1-8843-e0f12b355f28";
const otherId = "dce974b9-2bb9-43cf-99d3-103a43c1723a";
const runId = "a3429d20-9335-4900-93d3-18df8e796704";
const events: Array<Record<string, unknown>> = [];
let failInsert = false;
let runOwner = userId;

function from(table: string) {
    if (table === "learning_run_health") {
        const filters: Record<string, unknown> = {};
        const query = {
            select: () => query,
            eq: (key: string, value: unknown) => { filters[key] = value; return query; },
            maybeSingle: async () => ({ data: filters.run_id === runId && filters.user_id === runOwner ? { run_id: runId } : null, error: null }),
        };
        return query;
    }
    expect(table).toBe("app_diagnostic_events");
    const filters: Record<string, unknown> = {};
    const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        gte: () => query,
        insert: async (row: Record<string, unknown>) => {
            if (failInsert) throw new Error("private database detail");
            events.push(row);
            return { error: null };
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
            count: events.filter((row) => row.user_id === filters.user_id && row.fingerprint === filters.fingerprint).length,
            error: null,
        })),
    };
    return query;
}

function setup(route = "/api/learn/grade", handler?: Parameters<typeof withServerDiagnostics>[1]) {
    const jobs: Array<() => Promise<void>> = [];
    const wrapped = withServerDiagnostics(route, handler ?? (async (_request, scope) => {
        scope.setUser(userId);
        return new Response(null, { status: 500 });
    }), (task) => { jobs.push(task); });
    return { wrapped, jobs, flush: async () => { for (const job of jobs) await job(); } };
}

beforeEach(() => {
    events.length = 0; failInsert = false; runOwner = userId;
    mock.from.mockReset().mockImplementation(from);
});

describe("server diagnostics wrapper", () => {
    it.each([200, 400, 401, 403])("does not write for HTTP %i", async (status) => {
        const { wrapped, jobs } = setup("/api/learn/today", async (_request, scope) => {
            if (status !== 401) scope.setUser(userId);
            return new Response("unchanged", { status });
        });
        const response = await wrapped(new Request("https://app.test/api/learn/today?token=secret"));
        expect(response.status).toBe(status);
        expect(await response.text()).toBe("unchanged");
        expect(jobs).toHaveLength(0);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("records a returned 500 without reading or changing its response", async () => {
        const { wrapped, flush } = setup("/api/learn/today", async (_request, scope) => {
            scope.setUser(userId);
            return new Response("original private response", { status: 500, headers: { "x-original": "yes" } });
        });
        const response = await wrapped(new Request("https://app.test/api/learn/today?token=secret"));
        expect(response.status).toBe(500);
        expect(response.headers.get("x-original")).toBe("yes");
        expect(await response.text()).toBe("original private response");
        await flush();
        expect(events).toMatchObject([{ source: "server", category: "api_failure", error_code: "api_5xx", route: "/api/learn/today", http_status: 500, user_id: userId }]);
        expect(JSON.stringify(events)).not.toContain("private response");
    });

    it("records an unexpected exception and rethrows the original error", async () => {
        const original = new TypeError("token=secret card translation");
        const { wrapped, flush } = setup("/api/learn/grade", async (_request, scope) => { scope.setUser(userId); throw original; });
        await expect(wrapped(new Request("https://app.test/api/learn/grade"))).rejects.toBe(original);
        await flush();
        expect(events).toMatchObject([{ category: "server_exception", error_code: "unexpected_exception" }]);
        expect(JSON.stringify(events)).not.toMatch(/secret|translation/);
    });

    it("sanitizes Supabase codes, verifies run ownership, and emits only one event per 5xx", async () => {
        const { wrapped, flush } = setup("/api/learn/grade", async (request, scope) => {
            scope.setUser(userId);
            scope.setRunId(request.headers.get("x-diagnostics-run-id"));
            scope.supabaseFailure("card_progress", "upsert", "PGRST116");
            return new Response("original", { status: 500 });
        });
        const response = await wrapped(new Request("https://app.test/api/learn/grade", { headers: { "x-diagnostics-run-id": runId } }));
        expect(response.status).toBe(500);
        await flush();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ category: "supabase_failure", error_code: "db_card_progress_upsert_pgrst116", run_id: runId });
        expect(events[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);

        runOwner = otherId;
        const second = setup("/api/learn/grade", async (request, scope) => {
            scope.setUser(userId); scope.setRunId(request.headers.get("x-diagnostics-run-id"));
            scope.supabaseFailure("cards", "insert", "token=secret");
            return new Response(null, { status: 500 });
        });
        await second.wrapped(new Request("https://app.test/api/learn/grade", { headers: { "x-diagnostics-run-id": runId } }));
        await second.flush();
        expect(events.at(-1)).toMatchObject({ error_code: "db_cards_insert_unknown", run_id: null });
        expect(JSON.stringify(events)).not.toContain("secret");
    });

    it("limits repeated errors while retaining ten occurrences per user and window", async () => {
        for (let i = 0; i < 12; i++) {
            const { wrapped, flush } = setup();
            await wrapped(new Request("https://app.test/api/learn/grade"));
            await flush();
        }
        expect(events).toHaveLength(10);
    });

    it("ignores reporter failure and never instruments the Diagnostics endpoint itself", async () => {
        failInsert = true;
        const first = setup();
        const response = await first.wrapped(new Request("https://app.test/api/learn/grade"));
        await expect(first.flush()).resolves.toBeUndefined();
        expect(response.status).toBe(500);

        failInsert = false;
        const recursive = setup("/api/diagnostics/events");
        await recursive.wrapped(new Request("https://app.test/api/diagnostics/events"));
        await recursive.flush();
        expect(events).toHaveLength(0);
    });
});
