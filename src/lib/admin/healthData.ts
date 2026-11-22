import { supabaseServer } from "@/lib/supabaseServer";
import type { HealthWindow } from "./healthParams";
import type { HealthUser } from "./healthPresentation";

export type HealthEvent = {
    id: string; user_id: string; occurred_at: string; source: "client" | "server";
    severity: "error" | "warning"; category: string; error_code: string; route: string;
    http_status: number | null; fingerprint: string | null; run_id: string | null;
    browser_family: string | null; os_family: string | null; device_class: string | null;
    build_version: string | null;
};
export type HealthRun = {
    run_id: string; user_id: string; mode: string; run_kind: string | null; status: string;
    started_at: string; loaded_at: string | null; ended_at: string | null;
    initial_card_count: number; last_position: number; correct_count: number; wrong_count: number;
    last_successful_grade_at: string | null; last_heartbeat_at: string | null;
    sequence_number: number; end_reason: string | null; build_version: string | null;
};

const EVENT_COLUMNS = "id,user_id,occurred_at,source,severity,category,error_code,route,http_status,fingerprint,run_id,browser_family,os_family,device_class,build_version";
const RUN_COLUMNS = "run_id,user_id,mode,run_kind,status,started_at,loaded_at,ended_at,initial_card_count,last_position,correct_count,wrong_count,last_successful_grade_at,last_heartbeat_at,sequence_number,end_reason,build_version";
const SCAN_PAGE = 500;
const MAX_SCAN = 5_000;
export const HEALTH_EXPORT_LIMIT = 500;

function check(error: { message: string } | null): void {
    if (error) throw new Error("health_query_failed");
}

export function isOpenRun(run: HealthRun): boolean { return run.status === "loading" || run.status === "active"; }

export function isSuspectedAbandoned(run: HealthRun, now = Date.now()): boolean {
    if (!isOpenRun(run)) return false;
    const last = Date.parse(run.last_heartbeat_at ?? run.started_at);
    return Number.isFinite(last) && now - last > 5 * 60_000;
}

async function scanEvents(window: HealthWindow, userId?: string | null, limit = MAX_SCAN): Promise<{ rows: HealthEvent[]; total: number; truncated: boolean }> {
    const rows: HealthEvent[] = [];
    let total = 0;
    for (let offset = 0; offset < limit; offset += SCAN_PAGE) {
        let query = supabaseServer.from("app_diagnostic_events")
            .select(EVENT_COLUMNS, { count: offset === 0 ? "exact" : undefined })
            .gte("occurred_at", window.from).lt("occurred_at", window.to);
        if (userId) query = query.eq("user_id", userId);
        const { data, error, count } = await query
            .order("occurred_at", { ascending: false }).range(offset, offset + SCAN_PAGE - 1);
        check(error);
        if (offset === 0) total = count ?? 0;
        rows.push(...((data ?? []) as HealthEvent[]));
        if ((data ?? []).length < SCAN_PAGE) break;
    }
    return { rows, total: Math.max(total, rows.length), truncated: total > rows.length };
}

async function scanRuns(window: HealthWindow, userId?: string | null, limit = MAX_SCAN): Promise<{ rows: HealthRun[]; total: number; truncated: boolean }> {
    const rows: HealthRun[] = [];
    let total = 0;
    for (let offset = 0; offset < limit; offset += SCAN_PAGE) {
        let query = supabaseServer.from("learning_run_health")
            .select(RUN_COLUMNS, { count: offset === 0 ? "exact" : undefined })
            .gte("started_at", window.from).lt("started_at", window.to);
        if (userId) query = query.eq("user_id", userId);
        const { data, error, count } = await query
            .order("started_at", { ascending: false }).range(offset, offset + SCAN_PAGE - 1);
        check(error);
        if (offset === 0) total = count ?? 0;
        rows.push(...((data ?? []) as HealthRun[]));
        if ((data ?? []).length < SCAN_PAGE) break;
    }
    return { rows, total: Math.max(total, rows.length), truncated: total > rows.length };
}

export type HealthMetrics = ReturnType<typeof summarizeHealth>;

export function summarizeHealth(events: HealthEvent[], runs: HealthRun[], now = Date.now()) {
    const affectedUsers = new Set<string>();
    const users = new Set<string>();
    const fingerprints = new Map<string, { fingerprint: string | null; count: number; last_at: string; users: Set<string>; route: string; error_code: string; source: HealthEvent["source"] | "mixed" }>();
    for (const event of events) {
        affectedUsers.add(event.user_id);
        users.add(event.user_id);
        const key = event.fingerprint ?? `${event.error_code}|${event.route}`;
        const item = fingerprints.get(key) ?? { fingerprint: event.fingerprint, count: 0, last_at: event.occurred_at, users: new Set<string>(), route: event.route, error_code: event.error_code, source: event.source };
        item.count++;
        item.users.add(event.user_id);
        if (item.source !== event.source) item.source = "mixed";
        if (event.occurred_at > item.last_at) { item.last_at = event.occurred_at; item.route = event.route; }
        fingerprints.set(key, item);
    }
    for (const run of runs) users.add(run.user_id);
    const completed = runs.filter((run) => run.status === "completed");
    const durations = completed.map((run) => run.ended_at ? Date.parse(run.ended_at) - Date.parse(run.started_at) : NaN).filter((ms) => Number.isFinite(ms) && ms >= 0);
    const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    return {
        errors: events.filter((event) => event.severity === "error").length,
        warnings: events.filter((event) => event.severity === "warning").length,
        affectedUsers: affectedUsers.size,
        userIds: [...users].sort().slice(0, 100),
        startedRuns: runs.length,
        completedRuns: completed.length,
        openRuns: runs.filter(isOpenRun).length,
        suspectedAbandoned: runs.filter((run) => isSuspectedAbandoned(run, now)).length,
        gradeErrors: events.filter((event) => event.route === "/api/learn/grade" && event.severity === "error").length,
        sessionSaveErrors: events.filter((event) => event.route === "/api/learn/sessions" && event.severity === "error").length,
        apiServer5xx: events.filter((event) => event.source === "server" && (event.http_status ?? 0) >= 500).length,
        clientErrors: events.filter((event) => event.source === "client" && event.severity === "error").length,
        avgInitialCards: average(runs.map((run) => run.initial_card_count)),
        largestSession: Math.max(0, ...runs.map((run) => run.initial_card_count)),
        avgPosition: average(runs.map((run) => run.last_position)),
        runsOver100: runs.filter((run) => run.initial_card_count > 100).length,
        runsOver150: runs.filter((run) => run.initial_card_count > 150).length,
        avgCompletedDurationMinutes: durations.length ? Math.round(average(durations) / 60_000) : 0,
        topFingerprints: [...fingerprints.values()].sort((a, b) => b.count - a.count || b.last_at.localeCompare(a.last_at)).slice(0, 15).map((item) => ({
            fingerprint: item.fingerprint, count: item.count, last_at: item.last_at,
            affected_users: item.users.size, route: item.route, error_code: item.error_code, source: item.source,
        })),
    };
}

export async function getHealthOverview(window: HealthWindow, now = Date.now(), userId?: string | null) {
    const [events, runs] = await Promise.all([scanEvents(window, userId), scanRuns(window, userId)]);
    const users = await getUserIdentities([...new Set([...events.rows.map((event) => event.user_id), ...runs.rows.map((run) => run.user_id)])].slice(0, 100));
    return {
        window, metrics: summarizeHealth(events.rows, runs.rows, now),
        sampled: events.truncated || runs.truncated,
        scanned: { events: events.rows.length, runs: runs.rows.length },
        totals: { events: events.total, runs: runs.total },
        users,
        report: {
            events: { items: events.rows.slice(0, 100), total: events.total, page: 1, pageSize: 100 },
            runs: { items: runs.rows.slice(0, 100), total: runs.total, page: 1, pageSize: 100 },
        },
    };
}

export async function getHealthExport(window: HealthWindow, userId?: string | null, now = Date.now()) {
    const [events, runs] = await Promise.all([
        scanEvents(window, userId, HEALTH_EXPORT_LIMIT),
        scanRuns(window, userId, HEALTH_EXPORT_LIMIT),
    ]);
    const ids = [...new Set([...events.rows.map((event) => event.user_id), ...runs.rows.map((run) => run.user_id), ...(userId ? [userId] : [])])];
    const users = await getUserIdentities(ids);
    return {
        window,
        selectedUser: userId ? users.find((user) => user.id === userId) ?? { id: userId, email: null, display_name: null } : null,
        users,
        metrics: summarizeHealth(events.rows, runs.rows, now),
        sampled: events.truncated || runs.truncated,
        events: { items: events.rows, total: events.total, returned: events.rows.length, limit: HEALTH_EXPORT_LIMIT, truncated: events.truncated },
        runs: { items: runs.rows, total: runs.total, returned: runs.rows.length, limit: HEALTH_EXPORT_LIMIT, truncated: runs.truncated },
    };
}

export async function getEventsPage(window: HealthWindow, page: { page: number; pageSize: number; offset: number }, userId?: string | null, runId?: string | null) {
    let query = supabaseServer.from("app_diagnostic_events").select(EVENT_COLUMNS, { count: "exact" })
        .gte("occurred_at", window.from).lt("occurred_at", window.to);
    if (userId) query = query.eq("user_id", userId);
    if (runId) query = query.eq("run_id", runId);
    const { data, error, count } = await query.order("occurred_at", { ascending: false }).range(page.offset, page.offset + page.pageSize - 1);
    check(error);
    return { items: (data ?? []) as HealthEvent[], total: count ?? 0, page: page.page, pageSize: page.pageSize };
}

export async function getRunsPage(window: HealthWindow, page: { page: number; pageSize: number; offset: number }, userId?: string | null) {
    let query = supabaseServer.from("learning_run_health").select(RUN_COLUMNS, { count: "exact" })
        .gte("started_at", window.from).lt("started_at", window.to);
    if (userId) query = query.eq("user_id", userId);
    const { data, error, count } = await query.order("started_at", { ascending: false }).range(page.offset, page.offset + page.pageSize - 1);
    check(error);
    return { items: (data ?? []) as HealthRun[], total: count ?? 0, page: page.page, pageSize: page.pageSize };
}

export async function getRun(runId: string): Promise<HealthRun | null> {
    const { data, error } = await supabaseServer.from("learning_run_health").select(RUN_COLUMNS).eq("run_id", runId).maybeSingle();
    check(error);
    return (data ?? null) as HealthRun | null;
}

export async function getRunEventsPage(runId: string, userId: string, page: { page: number; pageSize: number; offset: number }) {
    const { data, error, count } = await supabaseServer.from("app_diagnostic_events")
        .select(EVENT_COLUMNS, { count: "exact" }).eq("run_id", runId).eq("user_id", userId)
        .order("occurred_at", { ascending: false }).range(page.offset, page.offset + page.pageSize - 1);
    check(error);
    return { items: (data ?? []) as HealthEvent[], total: count ?? 0, page: page.page, pageSize: page.pageSize };
}

function displayName(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const record = metadata as Record<string, unknown>;
    for (const key of ["display_name", "full_name", "name"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
    }
    return null;
}

export async function getUserIdentity(userId: string): Promise<HealthUser | null> {
    const { data, error } = await supabaseServer.auth.admin.getUserById(userId);
    if (error) {
        if (error.status === 404) return null;
        throw new Error("health_query_failed");
    }
    return data.user ? { id: data.user.id, email: data.user.email ?? null, display_name: displayName(data.user.user_metadata) } : null;
}

export async function getUserIdentities(userIds: string[]): Promise<HealthUser[]> {
    const unique = [...new Set(userIds)].slice(0, 100);
    const identities = await Promise.all(unique.map(async (userId) => {
        try { return await getUserIdentity(userId); } catch { return { id: userId, email: null, display_name: null }; }
    }));
    return identities.filter((identity): identity is HealthUser => Boolean(identity));
}
