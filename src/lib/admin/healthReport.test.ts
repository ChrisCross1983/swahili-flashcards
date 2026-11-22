import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHealthReport, buildHealthReportJson, copyHealthReport, downloadHealthReport, healthReportFilename } from "./healthReport";
import { getAdminUserLabel } from "./healthPresentation";

const window = { from: "2026-11-14T00:00:00.000Z", to: "2026-11-21T00:00:00.000Z", label: "2026-11-14–2026-11-20 UTC" };
const user = { id: "a3429d20-9335-4900-93d3-18df8e796704", email: "borza@example.test", display_name: "Christian Borza" };
const metrics = {
    errors: 2, warnings: 1, affectedUsers: 1, userIds: [user.id], startedRuns: 1, completedRuns: 0, openRuns: 1, suspectedAbandoned: 1,
    gradeErrors: 1, sessionSaveErrors: 0, apiServer5xx: 1, clientErrors: 1, avgInitialCards: 120, largestSession: 173,
    avgPosition: 83, avgCompletedDurationMinutes: 5, runsOver100: 1, runsOver150: 1,
    topFingerprints: [{ fingerprint: "abc123456789", count: 2, last_at: "2026-11-20T12:00:00.000Z", affected_users: 1, route: "/api/learn/grade?token=private", error_code: "grade_failed", source: "server" as const }],
};
const input = {
    meta: { generated_at: "2026-11-20T12:30:00.000Z", environment: "production", build_version: "commit123", timezone: "UTC" as const },
    window, selectedUser: user, users: [user], metrics, sampled: false,
    events: { items: [{ id: "dd0fa83f-e3c5-4cc1-8843-e0f12b355f28", user_id: user.id, occurred_at: "2026-11-20T12:00:00.000Z", source: "server" as const, severity: "error" as const, category: "api_failure", error_code: "grade_failed", route: "/api/learn/grade?token=private", http_status: 500, fingerprint: "abc123456789", run_id: "bd0fa83f-e3c5-4cc1-8843-e0f12b355f28", browser_family: null, os_family: null, device_class: null, build_version: null }], total: 501, returned: 500, limit: 500, truncated: true },
    runs: { items: [{ run_id: "bd0fa83f-e3c5-4cc1-8843-e0f12b355f28", user_id: user.id, mode: "LEITNER_TODAY", run_kind: "today", status: "active", started_at: "2026-11-20T11:00:00.000Z", loaded_at: null, ended_at: null, initial_card_count: 173, last_position: 83, correct_count: 60, wrong_count: 23, last_successful_grade_at: null, last_heartbeat_at: "2026-11-20T11:54:00.000Z", sequence_number: 83, end_reason: null, build_version: null }], total: 1, returned: 1, limit: 500, truncated: false },
};

describe("health report export", () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
    it("contains the selected user, full export accounting, anomalies and only sanitized diagnostic fields", () => {
        const report = buildHealthReport(input);
        expect(report).toContain("Zeitraum: 2026-11-14–2026-11-20 UTC");
        expect(report).toContain("Ausgewählter User: Christian Borza · borza@example.test");
        expect(report).toContain("Export enthält die neuesten 500 von 501 Einträgen (Limit 500)");
        expect(report).toContain("möglicher Abbruch");
        expect(report).toContain("ungewöhnlich große Session");
        expect(report).toContain("Für diesen Zeitraum wurden noch keine Request-Dauern persistiert");
        expect(report).toContain("abc12345…");
        expect(report).not.toContain("token=private");
        expect(report).not.toContain("a3429d20-9335-4900-93d3-18df8e796704");
        expect(healthReportFilename(window, user)).toBe("swahili-health-christian-borza-2026-11-14_2026-11-20.md");
        expect(healthReportFilename(window, user, "json")).toMatch(/\.json$/);
    });
    it("builds matching machine-readable JSON without raw identifiers or query strings", () => {
        const report = buildHealthReportJson(input);
        expect(report.meta.selected_user).toBe("Christian Borza · borza@example.test");
        expect(report.events).toMatchObject({ total: 501, returned: 500, truncated: true });
        expect(report.events.items[0]).toMatchObject({ route: "/api/learn/grade", user: "Christian Borza · borza@example.test", run_id: "bd0fa83f…" });
        expect(JSON.stringify(report)).not.toContain("token=private");
        expect(JSON.stringify(report)).not.toContain("a3429d20-9335-4900-93d3-18df8e796704");
    });
    it("uses name, email, then identifier fallback for user labels", () => {
        expect(getAdminUserLabel(user)).toBe("Christian Borza · borza@example.test");
        expect(getAdminUserLabel({ ...user, display_name: null })).toBe("borza@example.test · a3429d20…");
        expect(getAdminUserLabel({ ...user, email: null, display_name: null })).toBe("User a3429d20…");
    });
    it("copies exactly the generated Markdown", async () => {
        const writeText = vi.fn(async () => {});
        await copyHealthReport("# Flashcard Health Report\n", { writeText });
        expect(writeText).toHaveBeenCalledWith("# Flashcard Health Report\n");
    });
    it("downloads text with the chosen filename and releases the blob URL", () => {
        vi.useFakeTimers();
        const click = vi.fn();
        const link = { href: "", download: "", click };
        const createObjectURL = vi.fn(() => "blob:health-report");
        const revokeObjectURL = vi.fn();
        vi.stubGlobal("document", { createElement: vi.fn(() => link) });
        vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
        downloadHealthReport("# Report\n", "health.md");
        expect(link).toMatchObject({ href: "blob:health-report", download: "health.md" });
        expect(click).toHaveBeenCalledOnce();
        vi.runAllTimers();
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:health-report");
    });
});
