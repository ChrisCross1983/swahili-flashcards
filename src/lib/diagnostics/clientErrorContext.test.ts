import { describe, expect, it } from "vitest";
import { buildClientErrorContext, isBenignBrowserContext } from "./clientErrorContext";

describe("privacy-safe client error context", () => {
    it("parses Safari same-origin frames without persisting the message or URL query", () => {
        const error = new TypeError("private card text token=secret");
        error.stack = "renderCard@https://app.example/_next/static/chunks/app-abc.js?token=secret:12:34";
        const context = buildClientErrorContext({
            error, eventType: "window_error", sourceHint: "global", pageOrigin: "https://app.example",
        });
        expect(context).toMatchObject({
            error_name: "TypeError", message_category: "runtime_type", stack_origin: "same_origin",
            top_frame: "/_next/static/chunks/app-abc.js:12:34", same_origin: true,
        });
        expect(JSON.stringify(context)).not.toMatch(/private card|token=secret|app\.example/);
    });

    it("classifies aborts, ResizeObserver messages and opaque external errors as warnings", () => {
        const aborted = buildClientErrorContext({ error: new DOMException("operation aborted", "AbortError"), eventType: "unhandled_rejection" });
        const resize = buildClientErrorContext({ message: "ResizeObserver loop completed with undelivered notifications.", eventType: "window_error" });
        const external = buildClientErrorContext({ message: "Script error.", filename: "https://cdn.example/widget.js", eventType: "window_error", pageOrigin: "https://app.example" });
        expect(isBenignBrowserContext(aborted, "active", true)).toBe(true);
        expect(isBenignBrowserContext(resize, "active", true)).toBe(true);
        expect(isBenignBrowserContext(external, "active", true)).toBe(true);
        expect(external).toMatchObject({ message_category: "opaque_script_error", stack_origin: "external", same_origin: false });
    });

    it("keeps a same-origin runtime exception at error severity", () => {
        const error = new ReferenceError("missingVariable is not defined");
        error.stack = "handler@https://app.example/_next/static/chunks/page.js:5:9";
        const context = buildClientErrorContext({ error, eventType: "window_error", pageOrigin: "https://app.example" });
        expect(context).toMatchObject({ error_name: "ReferenceError", message_category: "runtime_reference", stack_origin: "same_origin" });
        expect(isBenignBrowserContext(context, "active", true)).toBe(false);
    });
});
