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
    | "type_undefined_member"
    | "type_null_member"
    | "type_not_function"
    | "type_illegal_invocation"
    | "runtime_reference"
    | "reference_missing_identifier"
    | "reference_tdz"
    | "runtime_syntax"
    | "runtime_other"
    | "unknown";

export type RejectionType = "error" | "dom_exception" | "string" | "object" | "primitive" | "null" | "not_promise";
export type StackOrigin = "same_origin" | "external" | "browser_extension" | "browser_native" | "unknown";
export type SourceKind = "next_chunk" | "inline_document" | "same_origin_other" | "external" | "browser_extension" | "browser_native" | "unknown";
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
    source_kind: SourceKind;
    source_line: number | null;
    source_column: number | null;
    error_symbol: string | null;
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
    if (name === "TypeError" && /undefined is not an object|cannot read (?:properties|property) of undefined/.test(text)) return "type_undefined_member";
    if (name === "TypeError" && /null is not an object|cannot read (?:properties|property) of null/.test(text)) return "type_null_member";
    if (name === "TypeError" && /is not a function|is not callable/.test(text)) return "type_not_function";
    if (name === "TypeError" && /illegal invocation|incompatible receiver/.test(text)) return "type_illegal_invocation";
    if (name === "ReferenceError" && /can't find variable|cannot find variable| is not defined/.test(text)) return "reference_missing_identifier";
    if (name === "ReferenceError" && /uninitialized variable|before initialization|temporal dead zone/.test(text)) return "reference_tdz";
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

type Frame = {
    stack_origin: StackOrigin;
    top_frame: string | null;
    same_origin: boolean | null;
    source_kind: SourceKind;
    source_line: number | null;
    source_column: number | null;
};

function safePosition(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10_000_000 ? value : null;
}

function safeErrorSymbol(error: unknown, message?: string | null): string | null {
    const text = typeof message === "string" ? message.slice(0, 500)
        : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message.slice(0, 500)
            : "";
    const reference = text.match(/(?:can't|cannot) find variable:\s*([A-Za-z_$][\w$]{0,79})/i)
        ?? text.match(/\b([A-Za-z_$][\w$]{0,79}) is not defined\b/i);
    if (reference) return reference[1];
    const evaluation = text.match(/evaluating\s+['"]([^'"]{1,160})['"]/i)?.[1];
    if (!evaluation) return null;
    const identifiers = evaluation.match(/[A-Za-z_$][\w$]*/g);
    return identifiers?.at(-1)?.slice(0, 80) ?? null;
}

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

export function extractStackFrame(
    error: unknown,
    filename?: string | null,
    pageOrigin?: string | null,
    pagePath?: string | null,
    eventLine?: number | null,
    eventColumn?: number | null,
): Frame {
    const stack = error && typeof error === "object" && "stack" in error && typeof error.stack === "string" ? error.stack : "";
    const candidates = [...stack.split("\n"), filename ?? ""].filter(Boolean);
    const origin = pageOrigin ?? (typeof window !== "undefined" ? window.location.origin : null);
    const pathname = pagePath ?? (typeof window !== "undefined" ? window.location.pathname : null);

    for (const lineText of candidates) {
        if (/\[native code\]|\bnative\b/i.test(lineText) && !/https?:\/\//.test(lineText)) {
            return { stack_origin: "browser_native", top_frame: null, same_origin: null, source_kind: "browser_native", source_line: null, source_column: null };
        }
        const extension = lineText.match(/(?:safari-web-extension|(?:chrome|moz)-extension):\/\/[^\s)]+/i);
        if (extension) return { stack_origin: "browser_extension", top_frame: null, same_origin: false, source_kind: "browser_extension", source_line: null, source_column: null };
        const absolute = lineText.match(/https?:\/\/[^\s)]+/i)?.[0];
        const relative = lineText.match(/\/_next\/static\/[^\s)]+/)?.[0];
        const found = absolute ?? relative;
        if (!found) continue;
        const location = cleanLocation(found);
        try {
            const url = new URL(location.base, origin ?? "https://app.invalid");
            const same = Boolean(origin) && url.origin === origin;
            const sourceLine = safePosition(location.line ? Number(location.line) : eventLine);
            const sourceColumn = safePosition(location.column ? Number(location.column) : eventColumn);
            if (!same) return { stack_origin: "external", top_frame: null, same_origin: false, source_kind: "external", source_line: sourceLine, source_column: sourceColumn };
            const sourceKind: SourceKind = url.pathname.startsWith("/_next/static/") ? "next_chunk"
                : pathname !== null && url.pathname === pathname ? "inline_document" : "same_origin_other";
            return {
                stack_origin: "same_origin",
                top_frame: safeSameOriginFrame(url.pathname, location.line, location.column),
                same_origin: true,
                source_kind: sourceKind,
                source_line: sourceLine,
                source_column: sourceColumn,
            };
        } catch {
            continue;
        }
    }
    return { stack_origin: "unknown", top_frame: null, same_origin: null, source_kind: "unknown", source_line: safePosition(eventLine), source_column: safePosition(eventColumn) };
}

export function buildClientErrorContext(input: {
    error?: unknown;
    message?: string | null;
    filename?: string | null;
    eventType: ClientEventType;
    sourceHint?: DiagnosticSourceHint;
    pageOrigin?: string | null;
    pagePath?: string | null;
    line?: number | null;
    column?: number | null;
}): ClientErrorContext {
    const frame = extractStackFrame(input.error, input.filename, input.pageOrigin, input.pagePath, input.line, input.column);
    return {
        event_type: input.eventType,
        error_name: objectName(input.error),
        message_category: classifyMessage(input.error, input.message),
        rejection_type: input.eventType === "unhandled_rejection" ? rejectionType(input.error) : "not_promise",
        ...frame,
        source_hint: input.sourceHint ?? "unknown",
        error_symbol: safeErrorSymbol(input.error, input.message),
    };
}

export function isBenignBrowserContext(context: ClientErrorContext, navigationState: NavigationState, online: boolean | null): boolean {
    if (isKnownInjectedBrowserContext(context)) return true;
    if (context.message_category === "aborted" || context.message_category === "resize_observer" || context.message_category === "opaque_script_error") return true;
    if (context.stack_origin === "browser_extension" || context.stack_origin === "external") return true;
    if (context.message_category === "network" && (navigationState !== "active" || online === false)) return true;
    if (context.event_type === "unhandled_rejection" && ["string", "primitive", "null"].includes(context.rejection_type)) return true;
    return false;
}

/**
 * Signatures verified against the shipped production source and build output.
 * A browser-injected script is reported with the document URL, so same-origin
 * `inline_document` alone is not evidence that the application owns the code.
 * Keep these matches deliberately narrow so unknown inline failures remain errors.
 */
export function isKnownInjectedBrowserContext(context: ClientErrorContext): boolean {
    if (context.event_type !== "window_error" || context.source_kind !== "inline_document" || context.source_line !== 1) return false;

    if (context.error_name === "ReferenceError"
        && context.message_category === "reference_missing_identifier"
        && context.error_symbol === "__firefox__"
        && context.source_column === 12) return true;

    if (context.error_name !== "TypeError" || context.message_category !== "type_undefined_member" || context.source_column !== 19) return false;
    if (context.error_symbol === "reader") return true;
    return /^refresh_youtube_quality_[A-F0-9]{32}$/.test(context.error_symbol ?? "");
}
