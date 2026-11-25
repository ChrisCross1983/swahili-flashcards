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
    "session_abandoned", "browser_abort", "resize_observer", "external_script_error", "injected_script_error",
]);
const BROWSERS = new Set(["Chrome", "Safari", "Firefox", "Edge", "Other"]);
const SYSTEMS = new Set(["iOS", "Android", "Windows", "macOS", "Linux", "Other"]);
const DEVICES = new Set(["desktop", "mobile", "tablet", "unknown"]);
const EVENT_TYPES = new Set(["window_error", "unhandled_rejection", "react_boundary", "network_request", "api_response", "manual"]);
const ERROR_NAMES = new Set(["Error", "TypeError", "ReferenceError", "SyntaxError", "RangeError", "URIError", "AbortError", "TimeoutError", "DOMException", "Other", "Unknown"]);
const MESSAGE_CATEGORIES = new Set(["aborted", "resize_observer", "opaque_script_error", "network", "chunk_load", "storage", "permission", "runtime_type", "type_undefined_member", "type_null_member", "type_not_function", "type_illegal_invocation", "runtime_reference", "reference_missing_identifier", "reference_tdz", "runtime_syntax", "runtime_other", "unknown"]);
const REJECTION_TYPES = new Set(["error", "dom_exception", "string", "object", "primitive", "null", "not_promise"]);
const STACK_ORIGINS = new Set(["same_origin", "external", "browser_extension", "browser_native", "unknown"]);
const SOURCE_HINTS = new Set(["global", "react_boundary", "api_client", "trainer", "ui", "unknown"]);
const SOURCE_KINDS = new Set(["next_chunk", "inline_document", "same_origin_other", "external", "browser_extension", "browser_native", "unknown"]);
const NAVIGATION_STATES = new Set(["active", "unloading", "page_hidden", "restored"]);
const VISIBILITY_STATES = new Set(["visible", "hidden", "prerender", "unknown"]);
const EVENT_KEYS = new Set([
    "event_id", "occurred_at", "source", "severity", "category", "error_code", "route",
    "http_status", "fingerprint", "run_id", "browser_family", "browser_version", "os_family", "device_class", "build_version",
    "event_type", "error_name", "message_category", "rejection_type", "stack_origin", "top_frame", "same_origin",
    "source_hint", "navigation_state", "online", "visibility_state",
    "source_kind", "source_line", "source_column", "error_symbol",
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

function optionalBoolean(value: unknown): boolean | null | undefined {
    if (value == null) return null;
    return typeof value === "boolean" ? value : undefined;
}

function optionalBrowserVersion(value: unknown): string | null | undefined {
    if (value == null || value === "") return null;
    return typeof value === "string" && /^[0-9.]{1,20}$/.test(value) ? value : undefined;
}

function optionalTopFrame(value: unknown): string | null | undefined {
    if (value == null || value === "") return null;
    return typeof value === "string" && value.length <= 180 && /^\/_next\/static\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+(?::\d{1,8}:\d{1,8})?$/.test(value)
        ? value : undefined;
}

function optionalPosition(value: unknown): number | null | undefined {
    if (value == null) return null;
    return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10_000_000 ? value : undefined;
}

function optionalErrorSymbol(value: unknown): string | null | undefined {
    if (value == null || value === "") return null;
    return typeof value === "string" && /^[A-Za-z_$][\w$]{0,79}$/.test(value) ? value : undefined;
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
    browser_version: string | null;
    os_family: string | null;
    device_class: string | null;
    build_version: string | null;
    event_type: string | null;
    error_name: string | null;
    message_category: string | null;
    rejection_type: string | null;
    stack_origin: string | null;
    top_frame: string | null;
    same_origin: boolean | null;
    source_hint: string | null;
    navigation_state: string | null;
    online: boolean | null;
    visibility_state: string | null;
    source_kind: string | null;
    source_line: number | null;
    source_column: number | null;
    error_symbol: string | null;
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
        const browserVersion = optionalBrowserVersion(event.browser_version);
        const os = optionalString(event.os_family, SYSTEMS);
        const device = optionalString(event.device_class, DEVICES);
        const build = optionalBuild(event.build_version);
        const eventType = optionalString(event.event_type, EVENT_TYPES);
        const errorName = optionalString(event.error_name, ERROR_NAMES);
        const messageCategory = optionalString(event.message_category, MESSAGE_CATEGORIES);
        const rejectionType = optionalString(event.rejection_type, REJECTION_TYPES);
        const stackOrigin = optionalString(event.stack_origin, STACK_ORIGINS);
        const topFrame = optionalTopFrame(event.top_frame);
        const sameOrigin = optionalBoolean(event.same_origin);
        const sourceHint = optionalString(event.source_hint, SOURCE_HINTS);
        const navigationState = optionalString(event.navigation_state, NAVIGATION_STATES);
        const online = optionalBoolean(event.online);
        const visibilityState = optionalString(event.visibility_state, VISIBILITY_STATES);
        const sourceKind = optionalString(event.source_kind, SOURCE_KINDS);
        const sourceLine = optionalPosition(event.source_line);
        const sourceColumn = optionalPosition(event.source_column);
        const errorSymbol = optionalErrorSymbol(event.error_symbol);
        if (!route || browser === undefined || browserVersion === undefined || os === undefined || device === undefined || build === undefined ||
            eventType === undefined || errorName === undefined || messageCategory === undefined || rejectionType === undefined ||
            stackOrigin === undefined || topFrame === undefined || sameOrigin === undefined || sourceHint === undefined ||
            navigationState === undefined || online === undefined || visibilityState === undefined || sourceKind === undefined ||
            sourceLine === undefined || sourceColumn === undefined || errorSymbol === undefined) return null;
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
            browser_version: browserVersion, event_type: eventType, error_name: errorName,
            message_category: messageCategory, rejection_type: rejectionType, stack_origin: stackOrigin,
            top_frame: topFrame, same_origin: sameOrigin, source_hint: sourceHint,
            navigation_state: navigationState, online, visibility_state: visibilityState,
            source_kind: sourceKind, source_line: sourceLine, source_column: sourceColumn, error_symbol: errorSymbol,
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
