import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { resetDiagnosticsRateLimitForTests } from "@/lib/diagnostics/rateLimit";
import { getHealthOverview, getRunEventsPage, isSuspectedAbandoned, type HealthRun } from "@/lib/admin/healthData";
import { withServerDiagnostics } from "@/lib/diagnostics/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from: mocks.from } }));

import { POST as postEvents } from "./events/route";
import { POST as postRuns } from "./runs/route";

const user = "a3429d20-9335-4900-93d3-18df8e796704";
const other = "b3429d20-9335-4900-93d3-18df8e796704";
const runId = "ad0fa83f-e3c5-4cc1-8843-e0f12b355f28";
const eventId = "dce974b9-2bb9-43cf-99d3-103a43c1723a";
const events = new Map<string, Record<string, unknown>>();
const runs = new Map<string, Record<string, unknown>>();

function request(path: string, body: unknown) {
    return new Request(`https://app.test${path}`, {
        method: "POST", headers: { "content-type": "application/json", origin: "https://app.test" }, body: JSON.stringify(body),
    });
}

function table(name: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let mutation: Record<string, unknown> | null = null;
    let counting = false;
    const store = name === "app_diagnostic_events" ? events : runs;
    const builder = {
        select: (_columns: string, options?: { count?: string; head?: boolean }) => { counting = Boolean(options?.count); return builder; },
        eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return builder; },
        gte: (key: string, value: unknown) => { filters.push((row) => String(row[key]) >= String(value)); return builder; },
        lt: (key: string, value: number | string) => { filters.push((row) => typeof value === "number" ? Number(row[key]) < value : String(row[key]) < value); return builder; },
        lte: (key: string, value: number) => { filters.push((row) => Number(row[key]) <= value); return builder; },
        in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return builder; },
        order: () => builder,
        range: async (start: number, end: number) => {
            const matching = [...store.values()].filter((row) => filters.every((filter) => filter(row)));
            return { data: matching.slice(start, end + 1), count: counting ? matching.length : null, error: null };
        },
        update: (value: Record<string, unknown>) => { mutation = value; return builder; },
        insert: async (value: Record<string, unknown>) => {
            const key = String(name === "app_diagnostic_events" ? value.id : value.run_id);
            if (store.has(key)) return { error: { code: "23505" } };
            store.set(key, name === "app_diagnostic_events" ? { ...value } : { ...value, started_at: new Date().toISOString(), initial_card_count: 0, last_position: 0, correct_count: 0, wrong_count: 0, sequence_number: 0 });
            return { error: null };
        },
        upsert: async (values: Record<string, unknown>[], options: Record<string, unknown>) => {
            expect(options).toEqual({ onConflict: "id", ignoreDuplicates: true });
            for (const value of values) if (!store.has(String(value.id))) store.set(String(value.id), { ...value, created_at: new Date().toISOString() });
            return { error: null };
        },
        maybeSingle: async () => ({ data: [...store.values()].find((row) => filters.every((filter) => filter(row))) ?? null, error: null }),
        then: (resolve: (result: unknown) => unknown) => {
            const matching = [...store.values()].filter((row) => filters.every((filter) => filter(row)));
            if (counting) return Promise.resolve(resolve({ count: matching.length, error: null }));
            if (mutation) {
                for (const row of matching) {
                    const merged = { ...row, ...mutation };
                    if (Number(merged.last_position) > Number(merged.initial_card_count) || Number(merged.correct_count) + Number(merged.wrong_count) > Number(merged.last_position)) {
                        return Promise.resolve(resolve({ data: null, error: { code: "23514" } }));
                    }
                    Object.assign(row, mutation);
                }
            }
            return Promise.resolve(resolve({ data: matching.map((row) => ({ run_id: row.run_id })), error: null }));
        },
    };
    return builder;
}

beforeEach(() => {
    events.clear(); runs.clear(); resetDiagnosticsRateLimitForTests();
    mocks.auth.mockReset(); mocks.from.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: user }, response: null });
    mocks.from.mockImplementation(table);
});

describe("POST /api/diagnostics/events", () => {
    const event = () => ({ event_id: eventId, occurred_at: new Date().toISOString(), source: "client", severity: "error", category: "api_failure", error_code: "grade_failed", route: "/api/learn/grade?token=secret" });
    it("rejects anonymous and spoofed requests", async () => {
        mocks.auth.mockResolvedValueOnce({ user: null, response: NextResponse.json({ code: "auth_required" }, { status: 401 }) });
        expect((await postEvents(request("/api/diagnostics/events", { events: [event()] }))).status).toBe(401);
        expect((await postEvents(request("/api/diagnostics/events", { events: [{ ...event(), user_id: other }] }))).status).toBe(400);
        expect(events.size).toBe(0);
    });
    it("stores only allowed fields, strips query, and deduplicates retries", async () => {
        const body = { events: [event()] };
        expect((await postEvents(request("/api/diagnostics/events", body))).status).toBe(200);
        expect((await postEvents(request("/api/diagnostics/events", body))).status).toBe(200);
        expect(events.size).toBe(1);
        expect(events.get(eventId)).toMatchObject({ user_id: user, route: "/api/learn/grade", error_code: "grade_failed" });
        expect(JSON.stringify(events.get(eventId))).not.toContain("secret");
    });
    it("rate limits a broken client", async () => {
        for (let i = 0; i < 30; i++) expect((await postEvents(request("/api/diagnostics/events", { events: [event()] }))).status).toBe(200);
        expect((await postEvents(request("/api/diagnostics/events", { events: [event()] }))).status).toBe(429);
    });
    it("uses the shared stored-event quota", async () => {
        for (let i = 0; i < 120; i++) events.set(String(i), { user_id: user, created_at: new Date().toISOString() });
        expect((await postEvents(request("/api/diagnostics/events", { events: [event()] }))).status).toBe(429);
    });
});

describe("POST /api/diagnostics/runs", () => {
    const send = (body: unknown) => postRuns(request("/api/diagnostics/runs", body));
    it("rejects anonymous users and client-supplied ownership", async () => {
        mocks.auth.mockResolvedValueOnce({ user: null, response: NextResponse.json({ code: "auth_required" }, { status: 401 }) });
        expect((await send({ action: "start", run_id: runId, mode: "DRILL" })).status).toBe(401);
        expect((await send({ action: "start", run_id: runId, mode: "DRILL", user_id: other })).status).toBe(400);
        expect(runs.size).toBe(0);
        expect(mocks.from).not.toHaveBeenCalledWith("app_admin_members");
    });
    it("caps run starts per user and hour", async () => {
        for (let i = 0; i < 120; i++) runs.set(String(i), { user_id: user, started_at: new Date().toISOString() });
        expect((await send({ action: "start", run_id: runId, mode: "DRILL" })).status).toBe(429);
    });
    it("starts, loads, checkpoints, heartbeats and ends a run", async () => {
        expect((await send({ action: "start", run_id: runId, mode: "LEITNER_TODAY", run_kind: "today" })).status).toBe(200);
        await expect((await send({ action: "start", run_id: runId, mode: "LEITNER_TODAY" })).json()).resolves.toEqual({ applied: false });
        expect((await send({ action: "loaded", run_id: runId, sequence_number: 1, initial_card_count: 2 })).status).toBe(200);
        expect((await send({ action: "checkpoint", run_id: runId, sequence_number: 2, last_position: 1, correct_count: 0, wrong_count: 1, grade_succeeded: true })).status).toBe(200);
        expect(runs.get(runId)?.last_successful_grade_at).toBeTruthy();
        expect((await send({ action: "heartbeat", run_id: runId, sequence_number: 3 })).status).toBe(200);
        expect(runs.get(runId)?.last_heartbeat_at).toBeTruthy();
        expect(runs.get(runId)?.sequence_number).toBe(2);
        await expect((await send({ action: "end", run_id: runId, sequence_number: 4, last_position: 2, correct_count: 1, wrong_count: 1, status: "completed", end_reason: "completed", grade_succeeded: true })).json()).resolves.toEqual({ applied: true });
        await expect((await send({ action: "end", run_id: runId, sequence_number: 4, last_position: 2, correct_count: 1, wrong_count: 1, status: "completed", end_reason: "completed" })).json()).resolves.toEqual({ applied: false });
        expect(runs.get(runId)).toMatchObject({ status: "completed", run_kind: "today", sequence_number: 4, correct_count: 1, wrong_count: 1 });
        expect(runs.get(runId)?.last_successful_grade_at).toBeTruthy();
    });
    it("prevents foreign updates, stale checkpoints and backward counts", async () => {
        runs.set(runId, { run_id: runId, user_id: other, status: "active", initial_card_count: 2, last_position: 0, correct_count: 0, wrong_count: 0, sequence_number: 0 });
        expect((await send({ action: "heartbeat", run_id: runId, sequence_number: 1 })).status).toBe(404);
        expect(runs.get(runId)?.sequence_number).toBe(0);
        runs.get(runId)!.user_id = user;
        await expect((await send({ action: "checkpoint", run_id: runId, sequence_number: 3, last_position: 2, correct_count: 2, wrong_count: 0 })).json()).resolves.toEqual({ applied: true });
        await expect((await send({ action: "checkpoint", run_id: runId, sequence_number: 2, last_position: 1, correct_count: 1, wrong_count: 0 })).json()).resolves.toEqual({ applied: false });
        await expect((await send({ action: "checkpoint", run_id: runId, sequence_number: 4, last_position: 2, correct_count: 1, wrong_count: 0 })).json()).resolves.toEqual({ applied: false });
        expect(runs.get(runId)).toMatchObject({ last_position: 2, correct_count: 2, sequence_number: 3 });
    });
    it("rejects a checkpoint beyond the loaded card count", async () => {
        await send({ action: "start", run_id: runId, mode: "DRILL" });
        await send({ action: "loaded", run_id: runId, sequence_number: 1, initial_card_count: 1 });
        expect((await send({ action: "checkpoint", run_id: runId, sequence_number: 2, last_position: 2, correct_count: 2, wrong_count: 0 })).status).toBe(400);
    });
    it("does not let an early heartbeat consume a delayed checkpoint sequence", async () => {
        await send({ action: "start", run_id: runId, mode: "DRILL" });
        await send({ action: "loaded", run_id: runId, sequence_number: 1, initial_card_count: 2 });
        await send({ action: "heartbeat", run_id: runId, sequence_number: 3 });
        await expect((await send({ action: "checkpoint", run_id: runId, sequence_number: 2, last_position: 1, correct_count: 1, wrong_count: 0 })).json()).resolves.toEqual({ applied: true });
    });
});

describe("controlled ingest-to-health simulation (in-memory DB)", () => {
    it("shows an ended 12-card run and its sanitized linked error, then derives an open run as suspected abandoned", async () => {
        const sendRun = (body: unknown) => postRuns(request("/api/diagnostics/runs", body));
        expect((await sendRun({ action: "start", run_id: runId, mode: "LEITNER_TODAY", run_kind: "today" })).status).toBe(200);
        expect((await sendRun({ action: "loaded", run_id: runId, sequence_number: 1, initial_card_count: 12 })).status).toBe(200);
        expect((await sendRun({ action: "checkpoint", run_id: runId, sequence_number: 2, last_position: 10, correct_count: 7, wrong_count: 3, grade_succeeded: true })).status).toBe(200);
        expect((await sendRun({ action: "heartbeat", run_id: runId, sequence_number: 2 })).status).toBe(200);
        expect((await postEvents(request("/api/diagnostics/events", { events: [{
            event_id: eventId, occurred_at: new Date().toISOString(), source: "client", severity: "error",
            category: "api_failure", error_code: "grade_failed", route: "/api/learn/grade?token=secret",
            fingerprint: "a".repeat(64), run_id: runId,
        }] }))).status).toBe(200);
        expect((await sendRun({ action: "end", run_id: runId, sequence_number: 3, status: "completed", end_reason: "completed", last_position: 12, correct_count: 8, wrong_count: 4, grade_succeeded: true })).status).toBe(200);

        const window = { from: new Date(Date.now() - 60_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString(), label: "test UTC", period: "custom" as const };
        const health = await getHealthOverview(window);
        expect(health.metrics).toMatchObject({ errors: 1, gradeErrors: 1, startedRuns: 1, completedRuns: 1, suspectedAbandoned: 0 });
        expect(runs.get(runId)).toMatchObject({ initial_card_count: 12, last_position: 12, correct_count: 8, wrong_count: 4, status: "completed" });
        expect(runs.get(runId)?.last_successful_grade_at).toBeTruthy();
        expect(runs.get(runId)?.last_heartbeat_at).toBeTruthy();
        expect((await getRunEventsPage(runId, user, { page: 1, pageSize: 25, offset: 0 })).items).toMatchObject([{ user_id: user, source: "client", category: "api_failure", error_code: "grade_failed", route: "/api/learn/grade", fingerprint: "a".repeat(64) }]);
        expect(JSON.stringify(events.get(eventId))).not.toContain("secret");

        const jobs: Array<() => Promise<void>> = [];
        const failingGrade = withServerDiagnostics("/api/learn/grade", async (_request, scope) => {
            scope.setUser(user); scope.setRunId(runId);
            return new Response(null, { status: 503 });
        }, (job) => { jobs.push(job); });
        expect((await failingGrade(new Request("https://app.test/api/learn/grade?token=secret"))).status).toBe(503);
        for (const job of jobs) await job();
        expect((await getHealthOverview(window)).metrics).toMatchObject({ apiServer5xx: 1, gradeErrors: 2 });
        expect((await getRunEventsPage(runId, user, { page: 1, pageSize: 25, offset: 0 })).total).toBe(2);
        expect(JSON.stringify([...events.values()])).not.toContain("secret");

        const abandonedId = "bce974b9-2bb9-43cf-99d3-103a43c1723a";
        expect((await sendRun({ action: "start", run_id: abandonedId, mode: "DRILL", run_kind: "all_cards" })).status).toBe(200);
        expect((await sendRun({ action: "loaded", run_id: abandonedId, sequence_number: 1, initial_card_count: 100 })).status).toBe(200);
        expect((await sendRun({ action: "checkpoint", run_id: abandonedId, sequence_number: 2, last_position: 10, correct_count: 5, wrong_count: 5 })).status).toBe(200);
        const open = runs.get(abandonedId) as HealthRun;
        expect(isSuspectedAbandoned(open, Date.now() + 4 * 60_000)).toBe(false);
        expect(isSuspectedAbandoned(open, Date.now() + 6 * 60_000)).toBe(true);
        expect(open.status).toBe("active");
    });
});
