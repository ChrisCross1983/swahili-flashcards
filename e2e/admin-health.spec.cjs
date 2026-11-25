/* eslint-disable @typescript-eslint/no-require-imports */
const { test, expect } = require("@playwright/test");

const userId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const user = { id: userId, display_name: "Test User", email: "test.user@example.test" };
const windowFor = (period) => ({
  from: period === "today" ? "2026-11-22T00:00:00.000Z" : "2026-11-15T00:00:00.000Z",
  to: "2026-11-23T00:00:00.000Z",
  label: period === "today" ? "Heute (UTC)" : "Letzte 7 Tage (UTC)",
});
const run = {
  run_id: runId, user_id: userId, mode: "leitner_today", run_kind: "today", status: "completed",
  started_at: "2026-11-22T07:00:00.000Z", loaded_at: "2026-11-22T07:00:04.000Z", ended_at: "2026-11-22T07:12:00.000Z",
  initial_card_count: 12, last_position: 12, correct_count: 9, wrong_count: 3,
  last_successful_grade_at: "2026-11-22T07:11:00.000Z", last_heartbeat_at: "2026-11-22T07:11:30.000Z",
  sequence_number: 14, end_reason: "completed", build_version: "e2e",
};
const event = {
  id: "33333333-3333-4333-8333-333333333333", user_id: userId, occurred_at: "2026-11-22T07:10:00.000Z",
  source: "server", severity: "error", category: "network", error_code: "translation_network_error",
  route: "/api/learn/grade", http_status: 503, fingerprint: "grade-network", run_id: runId,
  browser_family: "Safari", browser_version: "18.1", os_family: "iOS", device_class: "mobile", build_version: "e2e",
  event_type: "window_error", error_name: "TypeError", message_category: "runtime_type", rejection_type: "not_promise",
  stack_origin: "same_origin", top_frame: "/_next/static/chunks/app.js:1:2", same_origin: true, source_hint: "global",
  navigation_state: "active", online: true, visibility_state: "visible",
  source_kind: "next_chunk", source_line: 1, source_column: 2, error_symbol: "renderCard",
};
const metrics = {
  errors: 1, warnings: 0, affectedUsers: 1, startedRuns: 1, completedRuns: 1, openRuns: 0,
  suspectedAbandoned: 0, gradeErrors: 1, sessionSaveErrors: 0, apiServer5xx: 1, clientErrors: 0,
  avgInitialCards: 12, largestSession: 12, avgPosition: 12, avgCompletedDurationMinutes: 12,
  runsOver100: 0, runsOver150: 0,
  topFingerprints: [{ fingerprint: "grade-network", count: 1, last_at: event.occurred_at, affected_users: 1, route: event.route, error_code: event.error_code, source: "server", severity: "error", error_name: "TypeError", message_category: "runtime_type", stack_origin: "same_origin", source_kind: "next_chunk", error_symbol: "renderCard" }],
};
const pageOf = (items) => ({ items, total: items.length, page: 1, pageSize: 25 });

function json(body) { return { status: 200, contentType: "application/json", body: JSON.stringify(body) }; }

async function mockHealthApi(page) {
  await page.route("**/api/admin/health/**", async (route) => {
    const url = new URL(route.request().url());
    const period = url.searchParams.get("period") || "7d";
    const window = windowFor(period);
    if (url.pathname.endsWith("/overview")) return route.fulfill(json({ window, metrics, users: [user], sampled: false, scanned: { events: 1, runs: 1 }, totals: { events: 1, runs: 1 } }));
    if (url.pathname.endsWith("/events")) return route.fulfill(json(pageOf([event])));
    if (url.pathname.endsWith("/runs")) return route.fulfill(json(pageOf([run])));
    if (url.pathname.endsWith(`/runs/${runId}`)) return route.fulfill(json({ run, user, events: pageOf([event]) }));
    if (url.pathname.endsWith("/export")) return route.fulfill(json({
      meta: { generated_at: "2026-11-22T08:00:00.000Z", environment: "test", build_version: "e2e", timezone: "UTC" },
      window, selectedUser: url.searchParams.get("userId") ? user : null, users: [user], metrics, sampled: false,
      events: { ...pageOf([event]), returned: 1, limit: 500, truncated: false },
      runs: { ...pageOf([run]), returned: 1, limit: 500, truncated: false },
    }));
    return route.fulfill(json({ user, events: pageOf([event]), runs: pageOf([run]) }));
  });
}

test("admin health exports and run details are visibly usable", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockHealthApi(page);
  await page.goto("/admin/health");

  await expect(page.getByText("Diagnose-Report", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kurzreport kopieren" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Report herunterladen (.md)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Technische Daten (.json)" })).toBeVisible();
  await expect(page.getByLabel("Diagnose-User")).toContainText("Test User · test.user@example.test");

  await page.getByRole("button", { name: "Kurzreport kopieren" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Report kopiert" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("# Swahili Flashcards – Health Report");

  const markdownDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Report herunterladen (.md)" }).click();
  await expect((await markdownDownload).suggestedFilename()).toMatch(/^swahili-health-.*\.md$/);
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Technische Daten (.json)" }).click();
  await expect((await jsonDownload).suggestedFilename()).toMatch(/^swahili-health-.*\.json$/);

  await page.getByRole("button", { name: "Öffnen" }).click();
  const dialog = page.getByRole("dialog", { name: "Learning-Run-Detail" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Test User · test.user@example.test");
  await expect(dialog).toContainText("leitner_today · today");
  await expect(dialog).toContainText("translation_network_error");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByLabel("Diagnosezeitraum").selectOption("today");
  await page.getByRole("button", { name: "Kurzreport kopieren" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Heute (UTC)");
});
