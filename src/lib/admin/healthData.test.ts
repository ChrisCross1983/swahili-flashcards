import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: {} }));
import { isSuspectedAbandoned, summarizeHealth, type HealthEvent, type HealthRun } from "./healthData";

const userA = "a3429d20-9335-4900-93d3-18df8e796704";
const userB = "b3429d20-9335-4900-93d3-18df8e796704";
const now = Date.parse("2026-11-16T12:00:00.000Z");
const run = (changes: Partial<HealthRun> = {}): HealthRun => ({
    run_id: "ad0fa83f-e3c5-4cc1-8843-e0f12b355f28", user_id: userA, mode: "LEITNER_TODAY", run_kind: "today", status: "active",
    started_at: "2026-11-16T11:00:00.000Z", loaded_at: "2026-11-16T11:00:10.000Z", ended_at: null,
    initial_card_count: 127, last_position: 83, correct_count: 60, wrong_count: 23,
    last_successful_grade_at: "2026-11-16T11:53:00.000Z", last_heartbeat_at: "2026-11-16T11:54:59.000Z",
    sequence_number: 83, end_reason: null, build_version: null, ...changes,
});
const event = (changes: Partial<HealthEvent> = {}): HealthEvent => ({
    id: "dd0fa83f-e3c5-4cc1-8843-e0f12b355f28", user_id: userA, occurred_at: "2026-11-16T11:55:00.000Z",
    source: "server", severity: "error", category: "api_failure", error_code: "grade_failed", route: "/api/learn/grade",
    http_status: 500, fingerprint: "a".repeat(64), run_id: null, browser_family: null, browser_version: null, os_family: null,
    device_class: null, build_version: null, event_type: null, error_name: null, message_category: null,
    rejection_type: null, stack_origin: null, top_frame: null, same_origin: null, source_hint: null,
    navigation_state: null, online: null, visibility_state: null, source_kind: null, source_line: null,
    source_column: null, error_symbol: null, ...changes,
});

describe("health aggregates", () => {
    it("derives suspected abandonment only for stale open runs", () => {
        expect(isSuspectedAbandoned(run(), now)).toBe(true);
        expect(isSuspectedAbandoned(run({ last_heartbeat_at: "2026-11-16T11:55:00.000Z" }), now)).toBe(false);
        expect(isSuspectedAbandoned(run({ status: "completed", ended_at: "2026-11-16T11:59:00.000Z" }), now)).toBe(false);
        expect(isSuspectedAbandoned(run({ last_heartbeat_at: null }), now)).toBe(true);
    });
    it("counts errors, runs and grouped fingerprints without counting healthy users as affected", () => {
        const summary = summarizeHealth([
            event(), event({ id: "ee0fa83f-e3c5-4cc1-8843-e0f12b355f28", user_id: userB }),
            event({ id: "ff0fa83f-e3c5-4cc1-8843-e0f12b355f28", source: "client", severity: "warning", route: "/trainer", http_status: null, fingerprint: null }),
            event({ id: "af0fa83f-e3c5-4cc1-8843-e0f12b355f28", source: "client", route: "/api/learn/sessions", http_status: 503, fingerprint: null }),
        ], [
            run(), run({ run_id: "bd0fa83f-e3c5-4cc1-8843-e0f12b355f28", user_id: userB, status: "completed", ended_at: "2026-11-16T11:30:00.000Z", initial_card_count: 151, last_position: 151, started_at: "2026-11-16T11:00:00.000Z" }),
        ], now);
        expect(summary).toMatchObject({ errors: 3, warnings: 1, affectedUsers: 2, startedRuns: 2, completedRuns: 1, openRuns: 1, suspectedAbandoned: 1, gradeErrors: 2, sessionSaveErrors: 1, apiServer5xx: 2, clientErrors: 1, largestSession: 151, runsOver100: 2, runsOver150: 1, avgPosition: 117, avgCompletedDurationMinutes: 30 });
        expect(summary.topFingerprints[0]).toMatchObject({ count: 2, affected_users: 2, route: "/api/learn/grade" });
    });
});
