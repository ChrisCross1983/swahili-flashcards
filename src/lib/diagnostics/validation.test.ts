import { describe, expect, it } from "vitest";
import { normalizeRoute, parseEvents, readBoundedJson } from "./validation";
import { parseRunAction } from "./runs";

const id = "ad0fa83f-e3c5-4cc1-8843-e0f12b355f28";
const user = "a3429d20-9335-4900-93d3-18df8e796704";
const now = Date.parse("2026-11-16T12:00:00.000Z");
const event = () => ({
    event_id: id, occurred_at: new Date(now).toISOString(), source: "client",
    severity: "error", category: "api_failure", error_code: "grade_failed",
    route: "https://example.com/api/learn/grade?token=secret#fragment",
    browser_family: "Safari", browser_version: "18.1", os_family: "iOS", device_class: "mobile",
    event_type: "window_error", error_name: "TypeError", message_category: "runtime_type",
    rejection_type: "not_promise", stack_origin: "same_origin", top_frame: "/_next/static/chunks/app.js:1:2",
    same_origin: true, source_hint: "global", navigation_state: "active", online: true, visibility_state: "visible",
    source_kind: "next_chunk", source_line: 1, source_column: 2, error_symbol: "renderCard",
});

describe("diagnostic event input", () => {
    it("uses the authenticated user and removes URL values", () => {
        expect(parseEvents({ events: [event()] }, user, now)).toMatchObject([{ user_id: user, route: "/api/learn/grade" }]);
        expect(parseEvents({ events: [{ ...event(), severity: "warning", error_code: "injected_script_error" }] }, user, now))
            .toMatchObject([{ severity: "warning", error_code: "injected_script_error" }]);
        expect(normalizeRoute("/cards/secret-translation?key=secret")).toBe("/other");
        expect(normalizeRoute("/admin/health?userId=secret")).toBe("/admin/health");
        expect(normalizeRoute("/api/diagnostics/events")).toBeNull();
    });
    it("rejects extra fields, sensitive payloads and invalid values", () => {
        for (const change of [
            { user_id: user }, { message: "my translation" }, { request_body: "secret" },
            { source: "server" }, { severity: "fatal" }, { category: "secret" },
            { error_code: "secret" }, { fingerprint: "Bearer token" },
            { browser_family: "x".repeat(41) }, { http_status: 999 },
            { run_id: "wrong" }, { occurred_at: new Date(now - 8 * 86_400_000).toISOString() },
            { occurred_at: new Date(now + 6 * 60_000).toISOString() },
            { event_type: "click" }, { error_name: "PrivateError" }, { message_category: "private message" },
            { top_frame: "/_next/app.js?token=secret" }, { navigation_state: "private" }, { online: "yes" },
            { source_kind: "private" }, { source_line: 0 }, { source_column: 10_000_001 }, { error_symbol: "private value" },
        ]) expect(parseEvents({ events: [{ ...event(), ...change }] }, user, now)).toBeNull();
    });
    it("limits batches and repeated IDs within a batch", () => {
        expect(parseEvents({ events: Array.from({ length: 11 }, () => event()) }, user, now)).toBeNull();
        expect(parseEvents({ events: [event(), event()] }, user, now)).toBeNull();
    });
    it("caps the actual streamed body", async () => {
        await expect(readBoundedJson(new Request("https://app.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ large: "x".repeat(17_000) }) }))).rejects.toThrow("too_large");
    });
});

describe("learning run input", () => {
    it("accepts supported actions", () => {
        expect(parseRunAction({ action: "start", run_id: id, mode: "LEITNER_TODAY" })?.action).toBe("start");
        expect(parseRunAction({ action: "start", run_id: id, mode: "DRILL", run_kind: "last_missed" })).toMatchObject({ action: "start", run_kind: "last_missed" });
        expect(parseRunAction({ action: "loaded", run_id: id, sequence_number: 1, initial_card_count: 1 })?.action).toBe("loaded");
        expect(parseRunAction({ action: "heartbeat", run_id: id, sequence_number: 2 })?.action).toBe("heartbeat");
        expect(parseRunAction({ action: "end", run_id: id, sequence_number: 3, status: "completed", end_reason: "completed", last_position: 1, correct_count: 0, wrong_count: 1 })?.action).toBe("end");
    });
    it("rejects spoofing, invalid enums, negative or inconsistent counts", () => {
        const base = { action: "checkpoint", run_id: id, sequence_number: 2, last_position: 1, correct_count: 1, wrong_count: 0 };
        for (const change of [
            { user_id: user }, { sequence_number: -1 }, { correct_count: -1 },
            { wrong_count: 1 }, { last_position: 100_001 }, { grade_succeeded: "yes" },
        ]) expect(parseRunAction({ ...base, ...change })).toBeNull();
        expect(parseRunAction({ action: "start", run_id: id, mode: "OTHER" })).toBeNull();
        expect(parseRunAction({ action: "start", run_id: id, mode: "LEITNER_TODAY", run_kind: "repair_drill" })).toBeNull();
        expect(parseRunAction({ action: "end", run_id: id, sequence_number: 3, status: "completed", end_reason: "navigation", last_position: 0, correct_count: 0, wrong_count: 0 })).toBeNull();
    });
});
