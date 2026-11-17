import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
    flushDiagnostics, installGlobalDiagnostics, queuedDiagnosticsForTests,
    reportBoundaryError, reportClientError, resetClientDiagnosticsForTests,
} from "./client";
import { diagnosedFetch } from "./fetch";
import { postGrade, postLearnSession } from "@/lib/trainer/api";

const page = new EventTarget() as EventTarget & { location: { pathname: string } };
page.location = { pathname: "/trainer" };
const runId = "ad0fa83f-e3c5-4cc1-8843-e0f12b355f28";

beforeEach(() => {
    vi.stubGlobal("window", page);
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15" });
    resetClientDiagnosticsForTests();
});
afterEach(() => {
    resetClientDiagnosticsForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function emitted(type: string, error: Error) {
    const event = new Event(type) as Event & { error?: Error; reason?: Error };
    if (type === "error") event.error = error;
    else event.reason = error;
    page.dispatchEvent(event);
}

describe("client diagnostics", () => {
    it("captures window errors and unhandled rejections once, then cleans up", async () => {
        const fetchMock = vi.fn<(_url: string, _init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const close1 = installGlobalDiagnostics();
        const close2 = installGlobalDiagnostics();
        emitted("error", new TypeError("private card text"));
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        emitted("unhandledrejection", new ReferenceError("secret translation"));
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        close1(); close2();
        emitted("error", new Error("after cleanup"));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const bodies = fetchMock.mock.calls.map((call) => JSON.stringify(call[1]));
        expect(bodies.join(" ")).not.toMatch(/private card text|secret translation|after cleanup/);
    });

    it("deduplicates the same error across boundary and window handlers", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
        const close = installGlobalDiagnostics();
        const error = new TypeError("private text");
        reportBoundaryError(error);
        emitted("error", error);
        await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
        close();
        expect(readFileSync("src/app/error.tsx", "utf8")).toContain("reportBoundaryError(error)");
        expect(readFileSync("src/app/trainer/error.tsx", "utf8")).toContain("reportBoundaryError(error)");
    });

    it("drops diagnostics endpoint errors, removes querystrings and private paths", async () => {
        await reportClientError({ category: "api_failure", error_code: "api_request_failed", route: "/api/diagnostics/events", http_status: 503 });
        expect(queuedDiagnosticsForTests()).toHaveLength(0);
        await reportClientError({ category: "api_failure", error_code: "api_request_failed", route: "/api/learn/today?token=secret", http_status: 500 });
        await reportClientError({ category: "api_failure", error_code: "api_request_failed", route: "/cards/private-translation?token=secret", http_status: 501 });
        expect(queuedDiagnosticsForTests().map((event) => event.route)).toEqual(["/api/learn/today", "/other"]);
        expect(JSON.stringify(queuedDiagnosticsForTests())).not.toMatch(/secret|private-translation|userAgent/);
    });

    it("caps the queue, batches sends and retries a failed batch", async () => {
        for (let status = 100; status < 155; status++) {
            await reportClientError({ category: "api_failure", error_code: "api_request_failed", route: "/api/learn/today", http_status: status });
        }
        expect(queuedDiagnosticsForTests()).toHaveLength(50);
        const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network secret"))
            .mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        await flushDiagnostics();
        expect(queuedDiagnosticsForTests()).toHaveLength(50);
        await flushDiagnostics();
        expect(queuedDiagnosticsForTests()).toHaveLength(40);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.events).toHaveLength(10);
        expect(fetchMock.mock.calls[0][0]).toBe("/api/diagnostics/events");
    });

    it("uses same-origin keepalive when the page is left", async () => {
        const fetchMock = vi.fn<(_url: string, _init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const close = installGlobalDiagnostics();
        await reportClientError({ category: "api_failure", error_code: "api_request_failed", route: "/api/learn/setup-counts", http_status: 400 });
        page.dispatchEvent(new Event("pagehide"));
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ keepalive: true, credentials: "same-origin" });
        close();
    });

    it("flushes queued warnings after the short timer", async () => {
        vi.useFakeTimers();
        try {
            const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
            vi.stubGlobal("fetch", fetchMock);
            await reportClientError({ category: "api_failure", error_code: "api_request_failed", route: "/api/learn/setup-counts", http_status: 404 });
            expect(fetchMock).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1_500);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(queuedDiagnosticsForTests()).toHaveLength(0);
        } finally { vi.useRealTimers(); }
    });

    it("records 5xx and network errors but skips AbortError and successful requests", async () => {
        const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => url === "/api/diagnostics/events"
            ? new Response(null, { status: 200 }) : new Response(null, { status: 503 }));
        vi.stubGlobal("fetch", fetchMock);
        await diagnosedFetch("/api/learn/grade?card=private", {}, "grade_failed", runId);
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        const sent = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).events[0];
        expect(sent).toMatchObject({ route: "/api/learn/grade", error_code: "grade_failed", http_status: 503, run_id: runId });
        expect(JSON.stringify(sent)).not.toContain("private");

        resetClientDiagnosticsForTests();
        const clientErrorFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => url === "/api/diagnostics/events"
            ? new Response(null, { status: 200 }) : new Response(null, { status: 404 }));
        vi.stubGlobal("fetch", clientErrorFetch);
        await diagnosedFetch("/api/learn/today", {}, "today_load_failed");
        await vi.waitFor(() => expect(queuedDiagnosticsForTests()).toHaveLength(1));
        await flushDiagnostics();
        const warning = JSON.parse(String(clientErrorFetch.mock.calls[1]?.[1]?.body)).events[0];
        expect(warning).toMatchObject({ severity: "warning", error_code: "api_request_failed", http_status: 404 });

        resetClientDiagnosticsForTests();
        const networkFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
            if (url === "/api/diagnostics/events") return new Response(null, { status: 200 });
            throw new TypeError("token=secret");
        });
        vi.stubGlobal("fetch", networkFetch);
        await expect(diagnosedFetch("/api/learn/today", {}, "today_load_failed")).rejects.toThrow();
        await vi.waitFor(() => expect(networkFetch).toHaveBeenCalledTimes(2));
        expect(JSON.stringify(networkFetch.mock.calls[1][1])).not.toContain("secret");

        resetClientDiagnosticsForTests();
        const aborted = vi.fn(async () => { throw new DOMException("aborted", "AbortError"); });
        vi.stubGlobal("fetch", aborted);
        await expect(diagnosedFetch("/api/learn/setup-counts", {}, "api_request_failed")).rejects.toMatchObject({ name: "AbortError" });
        expect(queuedDiagnosticsForTests()).toHaveLength(0);

        const timedOut = vi.fn(async () => { throw new DOMException("private timeout detail", "TimeoutError"); });
        vi.stubGlobal("fetch", timedOut);
        await expect(diagnosedFetch("/api/learn/today", {}, "today_load_failed")).rejects.toMatchObject({ name: "TimeoutError" });
        await vi.waitFor(() => expect(queuedDiagnosticsForTests()).toHaveLength(1));
        expect(queuedDiagnosticsForTests()[0].error_code).toBe("timeout_error");

        resetClientDiagnosticsForTests();
        vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
        await diagnosedFetch("/api/learn/grade", {}, "grade_failed");
        expect(queuedDiagnosticsForTests()).toHaveLength(0);
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });

    it("correlates grade and session-save failures with the active run", async () => {
        const sent: Array<Record<string, unknown>> = [];
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (url === "/api/diagnostics/events") {
                sent.push(...JSON.parse(String(init?.body)).events);
                return new Response(null, { status: 200 });
            }
            return new Response(JSON.stringify({ error: "private backend detail" }), { status: 500 });
        });
        vi.stubGlobal("fetch", fetchMock);
        await expect(postGrade({ cardId: "private-card", correct: false, currentLevel: 0 }, runId)).rejects.toThrow();
        await vi.waitFor(() => expect(sent).toHaveLength(1));
        await expect(postLearnSession({ mode: "LEITNER", totalCount: 1, correctCount: 0, wrongCardIds: ["private-card"] }, runId)).rejects.toThrow();
        await vi.waitFor(() => expect(sent).toHaveLength(2));
        expect(sent).toMatchObject([
            { error_code: "grade_failed", run_id: runId, route: "/api/learn/grade" },
            { error_code: "session_save_failed", run_id: runId, route: "/api/learn/sessions" },
        ]);
        const learningRequests = fetchMock.mock.calls.filter(([url]) => url === "/api/learn/grade" || url === "/api/learn/sessions");
        expect(learningRequests).toHaveLength(2);
        for (const [, init] of learningRequests) expect(new Headers(init?.headers).get("x-diagnostics-run-id")).toBe(runId);
        expect(JSON.stringify(sent)).not.toMatch(/private-card|private backend detail/);
    });
});
