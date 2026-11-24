export type ClientEventType =
    | "window_error"
    | "unhandled_rejection"
    | "react_boundary"
    | "network_request"
    | "api_response"
    | "manual";

export type DiagnosticErrorName =
    | "Error"
    | "TypeError"
    | "ReferenceError"
    | "SyntaxError"
    | "RangeError"
    | "URIError"
    | "AbortError"
    | "TimeoutError"
    | "DOMException"
    | "Other"
    | "Unknown";

export type MessageCategory =
    | "aborted"
    | "resize_observer"
    | "opaque_script_error"
    | "network"
    | "chunk_load"
    | "storage"
    | "permission"
    | "runtime_type"
    | "runtime_reference"
    | "runtime_syntax"
    | "runtime_other"
    | "unknown";

export type RejectionType = "error" | "dom_exception" | "string" | "object" | "primitive" | "null" | "not_promise";
export type StackOrigin = "same_origin" | "external" | "browser_extension" | "browser_native" | "unknown";
export type NavigationState = "active" | "unloading" | "page_hidden" | "restored";
export type DiagnosticVisibility = "visible" | "hidden" | "prerender" | "unknown";
export type DiagnosticSourceHint = "global" | "react_boundary" | "api_client" | "trainer" | "ui" | "unknown";

export type ClientErrorContext = {
    event_type: ClientEventType;
    error_name: DiagnosticErrorName;
    message_category: MessageCategory;
    rejection_type: RejectionType;
    stack_origin: StackOrigin;
    top_frame: string | null;
    same_origin: boolean | null;
    source_hint: DiagnosticSourceHint;
};

const ERROR_NAMES = new Set<DiagnosticErrorName>([
    "Error", "TypeError", "ReferenceError", "SyntaxError", "RangeError", "URIError",
    "AbortError", "TimeoutError", "DOMException", "Other", "Unknown",
]);

function objectName(value: unknown): DiagnosticErrorName {
    if (!value || typeof value !== "object") return "Unknown";
    const raw = "name" in value ? value.name : null;
    if (raw === "SecurityError" || raw === "NotAllowedError" || raw === "QuotaExceededError" || raw === "NetworkError") return "DOMException";
    if (typeof raw === "string" && ERROR_NAMES.has(raw as DiagnosticErrorName)) return raw as DiagnosticErrorName;
    return typeof raw === "string" && raw ? "Other" : "Unknown";
}

function safeMessage(error: unknown, message?: string | null): string {
    if (typeof message === "string") return message.slice(0, 500).toLowerCase();
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message.slice(0, 500).toLowerCase();
    if (typeof error === "string") return error.slice(0, 500).toLowerCase();
    return "";
}

export function classifyMessage(error: unknown, message?: string | null): MessageCategory {
    const name = objectName(error);
    const text = safeMessage(error, message);
    if (name === "AbortError" || /\babort(?:ed|error)?\b|\bcancel(?:led|ed)?\b/.test(text)) return "aborted";
    if (text.includes("resizeobserver loop")) return "resize_observer";
    if (/^script error\.?$/.test(text.trim())) return "opaque_script_error";
    if (/chunkloaderror|loading (?:css )?chunk|dynamically imported module/.test(text)) return "chunk_load";
    if (/networkerror|network request failed|failed to fetch|load failed|internet connection|offline/.test(text)) return "network";
    if (/quotaexceeded|localstorage|sessionstorage|indexeddb|database.*version/.test(text)) return "storage";
    if (/notallowederror|securityerror|permission denied|operation is not allowed/.test(text)) return "permission";
    if (name === "TypeError") return "runtime_type";
    if (name === "ReferenceError") return "runtime_reference";
    if (name === "SyntaxError") return "runtime_syntax";
    if (name !== "Unknown") return "runtime_other";
    return "unknown";
}

export function rejectionType(value: unknown): RejectionType {
    if (value === null || value === undefined) return "null";
    if (typeof DOMException !== "undefined" && value instanceof DOMException) return "dom_exception";
    if (value instanceof Error) return "error";
    if (typeof value === "string") return "string";
    if (typeof value === "object") return "object";
    return "primitive";
}

type Frame = { stack_origin: StackOrigin; top_frame: string | null; same_origin: boolean | null };

function cleanLocation(raw: string): { base: string; line: string | null; column: string | null } {
    const value = raw.replace(/[),]+$/, "");
    const match = value.match(/^(.*?):(\d{1,8}):(\d{1,8})$/);
    return match ? { base: match[1], line: match[2], column: match[3] } : { base: value, line: null, column: null };
}

function safeSameOriginFrame(path: string, line: string | null, column: string | null): string | null {
    const clean = path.split("?")[0].split("#")[0];
    if (!clean.startsWith("/_next/static/") || clean.length > 150 || !/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(clean)) return null;
    return `${clean}${line && column ? `:${line}:${column}` : ""}`.slice(0, 180);
}

export function extractStackFrame(error: unknown, filename?: string | null, pageOrigin?: string | null): Frame {
    const stack = error && typeof error === "object" && "stack" in error && typeof error.stack === "string" ? error.stack : "";
    const candidates = [...stack.split("\n"), filename ?? ""].filter(Boolean);
    const origin = pageOrigin ?? (typeof window !== "undefined" ? window.location.origin : null);

    for (const lineText of candidates) {
        if (/\[native code\]|\bnative\b/i.test(lineText) && !/https?:\/\//.test(lineText)) {
            return { stack_origin: "browser_native", top_frame: null, same_origin: null };
        }
        const extension = lineText.match(/(?:safari-web-extension|(?:chrome|moz)-extension):\/\/[^\s)]+/i);
        if (extension) return { stack_origin: "browser_extension", top_frame: null, same_origin: false };
        const absolute = lineText.match(/https?:\/\/[^\s)]+/i)?.[0];
        const relative = lineText.match(/\/_next\/static\/[^\s)]+/)?.[0];
        const found = absolute ?? relative;
        if (!found) continue;
        const location = cleanLocation(found);
        try {
            const url = new URL(location.base, origin ?? "https://app.invalid");
            const same = Boolean(origin) && url.origin === origin;
            if (!same) return { stack_origin: "external", top_frame: null, same_origin: false };
            return {
                stack_origin: "same_origin",
                top_frame: safeSameOriginFrame(url.pathname, location.line, location.column),
                same_origin: true,
            };
        } catch {
            continue;
        }
    }
    return { stack_origin: "unknown", top_frame: null, same_origin: null };
}

export function buildClientErrorContext(input: {
    error?: unknown;
    message?: string | null;
    filename?: string | null;
    eventType: ClientEventType;
    sourceHint?: DiagnosticSourceHint;
    pageOrigin?: string | null;
}): ClientErrorContext {
    const frame = extractStackFrame(input.error, input.filename, input.pageOrigin);
    return {
        event_type: input.eventType,
        error_name: objectName(input.error),
        message_category: classifyMessage(input.error, input.message),
        rejection_type: input.eventType === "unhandled_rejection" ? rejectionType(input.error) : "not_promise",
        ...frame,
        source_hint: input.sourceHint ?? "unknown",
    };
}

export function isBenignBrowserContext(context: ClientErrorContext, navigationState: NavigationState, online: boolean | null): boolean {
    if (context.message_category === "aborted" || context.message_category === "resize_observer" || context.message_category === "opaque_script_error") return true;
    if (context.stack_origin === "browser_extension" || context.stack_origin === "external") return true;
    if (context.message_category === "network" && (navigationState !== "active" || online === false)) return true;
    if (context.event_type === "unhandled_rejection" && ["string", "primitive", "null"].includes(context.rejection_type)) return true;
    return false;
}
