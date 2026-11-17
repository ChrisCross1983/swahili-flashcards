const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[a-f0-9]{64}$/i;
const BUILD = /^[A-Za-z0-9._-]{1,80}$/;
const ROUTES = new Set([
    "/", "/trainer", "/sentence-trainer", "/stats", "/admin/health", "/import", "/login", "/path",
    "/path/basics", "/path/nominal-classes-intro", "/translator", "/translator/live",
    "/api/learn/grade", "/api/learn/sessions", "/api/learn/today", "/api/learn/setup-counts",
    "/api/cards", "/api/cards/all", "/api/cards/create", "/api/cards/import/commit",
    "/api/upload-image", "/api/upload-audio", "/api/stats/overview",
]);
const CATEGORIES = new Set(["client_exception", "network", "api_failure", "learning", "ui", "performance"]);
const ERROR_CODES = new Set([
    "unexpected_error", "render_error", "unhandled_rejection", "api_request_failed", "network_error",
    "grade_failed", "session_save_failed", "today_load_failed", "timeout_error", "large_session", "long_session",
    "session_abandoned",
]);
const BROWSERS = new Set(["Chrome", "Safari", "Firefox", "Edge", "Other"]);
const SYSTEMS = new Set(["iOS", "Android", "Windows", "macOS", "Linux", "Other"]);
const DEVICES = new Set(["desktop", "mobile", "tablet", "unknown"]);
const EVENT_KEYS = new Set([
    "event_id", "occurred_at", "source", "severity", "category", "error_code", "route",
    "http_status", "fingerprint", "run_id", "browser_family", "os_family", "device_class", "build_version",
]);

export const MAX_EVENT_BATCH = 10;
export const MAX_REQUEST_BYTES = 16_384;

export function isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID.test(value);
}

function record(value: unknown, allowed: Set<string>): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const input = value as Record<string, unknown>;
    return Object.keys(input).every((key) => allowed.has(key)) ? input : null;
}

function optionalString(value: unknown, allowed: Set<string>): string | null | undefined {
    if (value == null || value === "") return null;
    return typeof value === "string" && allowed.has(value) ? value : undefined;
}

export function optionalBuild(value: unknown): string | null | undefined {
    if (value == null || value === "") return null;
    return typeof value === "string" && BUILD.test(value) ? value : undefined;
}

export function normalizeRoute(value: unknown): string | null {
    if (typeof value !== "string" || value.length > 2_048 || /[\u0000-\u001f]/.test(value)) return null;
    try {
        const path = new URL(value, "https://app.invalid").pathname;
        // A future client reporter must never report failure of this ingest API back to itself.
        if (path === "/api/diagnostics" || path.startsWith("/api/diagnostics/")) return null;
        if (ROUTES.has(path)) return path;
        return path.startsWith("/api/") ? "/api/other" : "/other";
    } catch {
        return null;
    }
}

export type DiagnosticEventRow = {
    id: string;
    user_id: string;
    occurred_at: string;
    source: "client";
    severity: "error" | "warning";
    category: string;
    error_code: string;
    route: string;
    http_status: number | null;
    fingerprint: string | null;
    run_id: string | null;
    browser_family: string | null;
    os_family: string | null;
    device_class: string | null;
    build_version: string | null;
};

export function parseEvents(value: unknown, userId: string, now = Date.now()): DiagnosticEventRow[] | null {
    const envelope = record(value, new Set(["events"]));
    if (!envelope || !Array.isArray(envelope.events) || envelope.events.length < 1 || envelope.events.length > MAX_EVENT_BATCH) return null;
    const rows: DiagnosticEventRow[] = [];
    const seen = new Set<string>();
    for (const candidate of envelope.events) {
        const event = record(candidate, EVENT_KEYS);
        if (!event || !isUuid(event.event_id) || seen.has(event.event_id) || event.source !== "client" ||
            (event.severity !== "error" && event.severity !== "warning") ||
            !CATEGORIES.has(String(event.category)) || !ERROR_CODES.has(String(event.error_code))) return null;
        const at = typeof event.occurred_at === "string" ? Date.parse(event.occurred_at) : NaN;
        if (!Number.isFinite(at) || !/^\d{4}-\d{2}-\d{2}T/.test(String(event.occurred_at)) || at < now - 7 * 86_400_000 || at > now + 5 * 60_000) return null;
        const route = normalizeRoute(event.route);
        const browser = optionalString(event.browser_family, BROWSERS);
        const os = optionalString(event.os_family, SYSTEMS);
        const device = optionalString(event.device_class, DEVICES);
        const build = optionalBuild(event.build_version);
        if (!route || browser === undefined || os === undefined || device === undefined || build === undefined) return null;
        const status = event.http_status == null ? null : event.http_status;
        if (status !== null && (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599)) return null;
        const fingerprint = event.fingerprint == null || event.fingerprint === "" ? null : event.fingerprint;
        if (fingerprint !== null && (typeof fingerprint !== "string" || !FINGERPRINT.test(fingerprint))) return null;
        const runId = event.run_id == null || event.run_id === "" ? null : event.run_id;
        if (runId !== null && !isUuid(runId)) return null;
        rows.push({
            id: event.event_id, user_id: userId, occurred_at: new Date(at).toISOString(), source: "client",
            severity: event.severity, category: String(event.category), error_code: String(event.error_code), route,
            http_status: status as number | null, fingerprint: fingerprint?.toLowerCase() ?? null,
            run_id: runId, browser_family: browser, os_family: os, device_class: device, build_version: build,
        });
        seen.add(event.event_id);
    }
    return rows;
}

export async function readBoundedJson(request: Request): Promise<unknown> {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("invalid_content_type");
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) throw new Error("too_large");
    if (!request.body) throw new Error("invalid_json");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_REQUEST_BYTES) {
                await reader.cancel();
                throw new Error("too_large");
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new Error("invalid_json"); }
}

export function sameOrigin(request: Request): boolean {
    const origin = request.headers.get("origin");
    if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
    try { return new URL(origin).origin === new URL(request.url).origin; }
    catch { return false; }
}
