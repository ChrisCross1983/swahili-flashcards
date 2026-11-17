import { createHash, randomUUID } from "node:crypto";
import { after } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { isUuid, normalizeRoute } from "@/lib/diagnostics/validation";

const TABLES = new Set(["cards", "card_progress", "learn_sessions", "learn_last_missed", "groups", "card_groups"]);
const OPERATIONS = new Set(["select", "insert", "update", "delete", "upsert"]);
const MAX_SAME_ERROR_PER_5_MINUTES = 10;

type Report = {
    userId: string;
    route: string;
    status: number;
    code: string;
    category: "api_failure" | "server_exception" | "supabase_failure";
    runId: string | null;
    operation?: string;
    table?: string;
    exceptionName?: string;
};

function safeDatabaseCode(value: unknown): string {
    return typeof value === "string" && /^[A-Za-z0-9_]{1,12}$/.test(value) ? value.toLowerCase() : "unknown";
}

function safeExceptionName(value: unknown): string {
    const name = value && typeof value === "object" && "name" in value ? value.name : null;
    return typeof name === "string" && ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError"].includes(name) ? name : "Other";
}

function buildVersion(): string | null {
    const value = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_APP_VERSION ?? null;
    return value && /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : null;
}

export async function writeServerDiagnostic(report: Report): Promise<void> {
    try {
        const route = normalizeRoute(report.route);
        if (!route || !isUuid(report.userId) || report.status < 500 || report.status > 599) return;
        const fingerprint = createHash("sha256")
            .update([route, report.code, report.operation ?? "", report.table ?? "", report.exceptionName ?? ""].join("|"))
            .digest("hex");
        const since = new Date(Date.now() - 5 * 60_000).toISOString();
        const { count, error: countError } = await supabaseServer.from("app_diagnostic_events")
            .select("id", { count: "exact", head: true })
            .eq("user_id", report.userId).eq("fingerprint", fingerprint).gte("occurred_at", since);
        if (countError || count === null || count >= MAX_SAME_ERROR_PER_5_MINUTES) return;

        let runId: string | null = null;
        if (isUuid(report.runId)) {
            const { data, error } = await supabaseServer.from("learning_run_health")
                .select("run_id").eq("run_id", report.runId).eq("user_id", report.userId).maybeSingle();
            if (!error && data) runId = report.runId;
        }
        await supabaseServer.from("app_diagnostic_events").insert({
            id: randomUUID(), user_id: report.userId, occurred_at: new Date().toISOString(),
            source: "server", severity: "error", category: report.category, error_code: report.code,
            route, http_status: report.status, fingerprint, run_id: runId,
            browser_family: null, os_family: null, device_class: null, build_version: buildVersion(),
        });
    } catch { /* Never affect the API response or recursively report Diagnostics errors. */ }
}

export type ServerDiagnosticScope = {
    setUser: (userId: string) => void;
    setRunId: (value: string | null) => void;
    supabaseFailure: (table: string, operation: string, databaseCode: unknown, status?: number) => void;
};

type Scheduler = (task: () => Promise<void>) => void;

function scheduleAfter(task: () => Promise<void>): void {
    try { after(task); }
    catch { void task(); } // Unit tests and callers outside a Next request context.
}

export function withServerDiagnostics(
    route: string,
    handler: (request: Request, scope: ServerDiagnosticScope) => Promise<Response>,
    schedule: Scheduler = scheduleAfter,
): (request: Request) => Promise<Response> {
    return async (request) => {
        let userId: string | null = null;
        let runId: string | null = null;
        let reported = false;
        const emit = (category: Report["category"], code: string, status: number, extra: Partial<Report> = {}) => {
            if (!userId || reported || status < 500) return;
            reported = true;
            const report: Report = { userId, route, runId, category, code, status, ...extra };
            try { schedule(() => writeServerDiagnostic(report)); }
            catch { /* Scheduling itself must not change the response. */ }
        };
        const scope: ServerDiagnosticScope = {
            setUser: (value) => { if (isUuid(value)) userId = value; },
            setRunId: (value) => { runId = isUuid(value) ? value : null; },
            supabaseFailure: (table, operation, databaseCode, status = 500) => {
                if (!TABLES.has(table) || !OPERATIONS.has(operation)) return;
                const code = `db_${table}_${operation}_${safeDatabaseCode(databaseCode)}`;
                emit("supabase_failure", code, status, { table, operation });
            },
        };
        try {
            const response = await handler(request, scope);
            if (response.status >= 500) emit("api_failure", "api_5xx", response.status);
            return response;
        } catch (error) {
            emit("server_exception", "unexpected_exception", 500, { exceptionName: safeExceptionName(error) });
            throw error;
        }
    };
}
