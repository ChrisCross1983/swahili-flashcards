import { describe, expect, it } from "vitest";
import { buildClientErrorContext, isBenignBrowserContext, isKnownInjectedBrowserContext } from "./clientErrorContext";

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
            source_kind: "next_chunk", source_line: 12, source_column: 34,
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
        expect(context).toMatchObject({ error_name: "ReferenceError", message_category: "reference_missing_identifier", error_symbol: "missingVariable", stack_origin: "same_origin" });
        expect(isBenignBrowserContext(context, "active", true)).toBe(false);
    });

    it("captures only a bounded identifier and document position for inline Safari errors", () => {
        const error = new ReferenceError("Can't find variable: missingWidget");
        error.stack = "global code@https://app.example/trainer:4:27";
        const context = buildClientErrorContext({ error, eventType: "window_error", pageOrigin: "https://app.example", pagePath: "/trainer" });
        expect(context).toMatchObject({
            message_category: "reference_missing_identifier", error_symbol: "missingWidget",
            source_kind: "inline_document", source_line: 4, source_column: 27, top_frame: null,
        });
        expect(JSON.stringify(context)).not.toContain("Can't find variable");
    });

    it("recognizes only the verified browser-injected inline signatures", () => {
        const injected = [
            buildClientErrorContext({
                error: new ReferenceError("Can't find variable: __firefox__"), message: "Can't find variable: __firefox__",
                filename: "https://app.example/trainer", line: 1, column: 12, eventType: "window_error",
                pageOrigin: "https://app.example", pagePath: "/trainer",
            }),
            buildClientErrorContext({
                error: new TypeError("undefined is not an object (evaluating 'window.__firefox__.reader')"),
                filename: "https://app.example/trainer", line: 1, column: 19, eventType: "window_error",
                pageOrigin: "https://app.example", pagePath: "/trainer",
            }),
            buildClientErrorContext({
                error: new TypeError("undefined is not an object (evaluating 'refresh_youtube_quality_25C6288018C14FF495E38C4C03A31B7B')"),
                filename: "https://app.example/trainer", line: 1, column: 19, eventType: "window_error",
                pageOrigin: "https://app.example", pagePath: "/trainer",
            }),
        ];
        for (const context of injected) {
            expect(isKnownInjectedBrowserContext(context)).toBe(true);
            expect(isBenignBrowserContext(context, "active", true)).toBe(true);
        }

        const unknownInline = buildClientErrorContext({
            error: new TypeError("undefined is not an object (evaluating 'undefined')"),
            filename: "https://app.example/trainer", line: 1, column: 16, eventType: "window_error",
            pageOrigin: "https://app.example", pagePath: "/trainer",
        });
        expect(unknownInline).toMatchObject({ source_kind: "inline_document", error_symbol: "undefined" });
        expect(isKnownInjectedBrowserContext(unknownInline)).toBe(false);
        expect(isBenignBrowserContext(unknownInline, "active", true)).toBe(false);
    });

    it("does not downgrade a generic reader failure outside the verified injected signature", () => {
        const context = buildClientErrorContext({
            error: new TypeError("undefined is not an object (evaluating 'reader')"),
            filename: "https://app.example/trainer", line: 4, column: 19, eventType: "window_error",
            pageOrigin: "https://app.example", pagePath: "/trainer",
        });
        expect(isKnownInjectedBrowserContext(context)).toBe(false);
        expect(isBenignBrowserContext(context, "active", true)).toBe(false);
    });
});
