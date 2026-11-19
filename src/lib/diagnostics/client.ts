import { detectTranslatorPlatform } from "@/lib/translator/diagnosticMetadata";
import { isUuid, normalizeRoute } from "@/lib/diagnostics/validation";

type Code = "unexpected_error" | "unhandled_rejection" | "render_error" | "api_request_failed" | "network_error" | "timeout_error" | "grade_failed" | "session_save_failed" | "today_load_failed";
type Category = "client_exception" | "network" | "api_failure" | "learning" | "ui";
type Event = {
    event_id: string; occurred_at: string; source: "client"; severity: "error" | "warning";
    category: Category; error_code: Code; route: string; http_status: number | null;
    fingerprint: string | null; run_id: string | null; browser_family: string; os_family: string;
    device_class: "desktop" | "mobile" | "tablet" | "unknown"; build_version: string | null;
};

const ENDPOINT = "/api/diagnostics/events";
const MAX_QUEUE = 50;
const BATCH = 10;
const DEDUP_MS = 5_000;
const FLUSH_MS = 1_500;
const MAX_RETRIES = 2;
const queue: Event[] = [];
const recent = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let sending = false;
let attempts = 0;
let listeners = 0;
let installedCleanup: (() => void) | null = null;
let ingestUnavailableUntil = 0;

function route(): string {
    if (typeof window === "undefined") return "/other";
    return normalizeRoute(window.location.pathname) ?? "/api/diagnostics";
}

function errorType(value: unknown): string {
    if (!(value instanceof Error)) return "Unknown";
    return ["Error", "TypeError", "ReferenceError", "SyntaxError", "RangeError", "URIError"].includes(value.name) ? value.name : "Other";
}

function firstFrame(value: unknown): string {
    if (!(value instanceof Error) || typeof value.stack !== "string") return "unknown";
    const match = value.stack.match(/(?:\/_next\/static\/[^\s?#():]+|webpack-internal:\/\/\/[^\s?#():]+):\d+(?::\d+)?/);
    return match?.[0] ?? "unknown";
}

async function fingerprint(value: string): Promise<string | null> {
    try {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch { return null; }
}

function metadata() {
    const ua = navigator.userAgent;
    const platform = detectTranslatorPlatform(ua);
    const device_class = /iPad|Tablet/i.test(ua) ? "tablet" as const
        : /Mobi|iPhone|Android/i.test(ua) ? "mobile" as const : "desktop" as const;
    const rawBuild = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_APP_VERSION ?? null;
    const build_version = rawBuild && /^[A-Za-z0-9._-]{1,80}$/.test(rawBuild) ? rawBuild : null;
    return { browser_family: platform.browserFamily, os_family: platform.osFamily, device_class, build_version };
}

function schedule(ms = FLUSH_MS) {
    if (timer) return;
    timer = setTimeout(() => { timer = null; void flushDiagnostics(); }, ms);
}

export async function flushDiagnostics(keepalive = false): Promise<void> {
    if (Date.now() < ingestUnavailableUntil || sending || queue.length === 0 || typeof window === "undefined") return;
    sending = true;
    const batch = queue.slice(0, BATCH);
    try {
        const response = await fetch(ENDPOINT, {
            method: "POST", headers: { "Content-Type": "application/json" },
            credentials: "same-origin", body: JSON.stringify({ events: batch }),
            // Same-origin cookies authenticate the request; keepalive also covers navigation during an in-flight flush.
            keepalive: true,
        });
        if (response.status === 503) {
            ingestUnavailableUntil = process.env.NODE_ENV === "production" ? Date.now() + 60_000 : Infinity;
            queue.length = 0;
            attempts = 0;
        } else if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
            queue.splice(0, batch.length);
            attempts = 0;
        } else {
            attempts++;
        }
    } catch { attempts++; }
    finally {
        sending = false;
        if (attempts > MAX_RETRIES) { queue.splice(0, batch.length); attempts = 0; }
        if (queue.length > 0 && !keepalive) schedule(attempts ? 1_000 * 2 ** attempts : FLUSH_MS);
    }
}

export async function reportClientError(input: {
    category: Category; error_code: Code; severity?: "error" | "warning";
    error?: unknown; route?: string; http_status?: number | null; run_id?: string | null; urgent?: boolean;
}): Promise<void> {
    try {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (Date.now() < ingestUnavailableUntil) return;
    const page = input.route ? normalizeRoute(input.route) : route();
    if (!page || page === "/api/diagnostics") return;
    const status = input.http_status && input.http_status >= 100 && input.http_status <= 599 ? input.http_status : null;
    const crash = input.category === "client_exception" || input.error_code === "render_error";
    const key = `${crash ? "runtime" : input.error_code}|${errorType(input.error)}|${firstFrame(input.error)}|${page}|${status ?? ""}|${isUuid(input.run_id) ? input.run_id : ""}`;
    const hash = await fingerprint(key);
    const dedupKey = hash ?? key;
    const now = Date.now();
    if (recent.get(dedupKey) && now - recent.get(dedupKey)! < DEDUP_MS) return;
    recent.set(dedupKey, now);
    if (recent.size > 100) {
        for (const [entry, at] of recent) if (now - at > DEDUP_MS) recent.delete(entry);
        while (recent.size > 100) recent.delete(recent.keys().next().value!);
    }
    queue.push({
        event_id: crypto.randomUUID(), occurred_at: new Date(now).toISOString(), source: "client",
        severity: input.severity ?? "error", category: input.category, error_code: input.error_code,
        route: page, http_status: status, fingerprint: hash, run_id: isUuid(input.run_id) ? input.run_id : null, ...metadata(),
    });
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    if (input.urgent) void flushDiagnostics(); else schedule();
    } catch { /* Diagnostics must never create an unhandled rejection. */ }
}

export function installGlobalDiagnostics(): () => void {
    if (typeof window === "undefined") return () => {};
    listeners++;
    if (!installedCleanup) {
        const onError = (event: ErrorEvent) => { void reportClientError({ category: "client_exception", error_code: "unexpected_error", error: event.error, urgent: true }); };
        const onRejection = (event: PromiseRejectionEvent) => { void reportClientError({ category: "client_exception", error_code: "unhandled_rejection", error: event.reason, urgent: true }); };
        const onPageHide = () => { void flushDiagnostics(true); };
        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onRejection);
        window.addEventListener("pagehide", onPageHide);
        installedCleanup = () => {
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onRejection);
            window.removeEventListener("pagehide", onPageHide);
        };
    }
    return () => {
        listeners--;
        if (listeners === 0) { installedCleanup?.(); installedCleanup = null; }
    };
}

export function reportBoundaryError(error: Error): void {
    void reportClientError({ category: "client_exception", error_code: "render_error", error, urgent: true });
}

export function resetClientDiagnosticsForTests(): void {
    if (timer) clearTimeout(timer);
    timer = null; sending = false; attempts = 0; ingestUnavailableUntil = 0; queue.length = 0; recent.clear();
    installedCleanup?.(); installedCleanup = null; listeners = 0;
}

export function queuedDiagnosticsForTests(): readonly Event[] { return queue; }
