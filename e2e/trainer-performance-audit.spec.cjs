/* eslint-disable @typescript-eslint/no-require-imports */
const { test, expect } = require("@playwright/test");

const enabled = process.env.PERFORMANCE_AUDIT === "1";
const testEmail = process.env.SECURITY_TEST_EMAIL || process.env.PLAYWRIGHT_TEST_EMAIL;
const testPassword = process.env.SECURITY_TEST_PASSWORD || process.env.PLAYWRIGHT_TEST_PASSWORD;
const routes = new Set([
  "/",
  "/trainer",
  "/api/learn/setup-counts",
  "/api/learn/quick-start",
  "/api/groups",
  "/api/cards",
  "/api/learn/today",
  "/api/learn/stats",
  "/api/diagnostics/runs",
]);

function trackedRoute(url) {
  if (routes.has(url.pathname)) return `${url.pathname}${url.search}`;
  if (url.hostname.endsWith(".supabase.co") && url.pathname === "/auth/v1/user") return "supabase:/auth/v1/user";
  return null;
}

test.describe("trainer performance audit", () => {
  test.skip(!enabled, "Set PERFORMANCE_AUDIT=1 to collect real local timings.");
  test.skip(!testEmail || !testPassword, "Performance audit needs local SECURITY_TEST_EMAIL and SECURITY_TEST_PASSWORD.");

  test("records an authenticated, read-only trainer waterfall", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel("E-Mail").fill(testEmail);
    await page.getByLabel("Passwort").fill(testPassword);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/"),
      page.getByRole("button", { name: "Einloggen", exact: true }).click(),
    ]);

    // Login uses the regular production auth flow. Start the measurement only
    // afterwards, so its navigation and Supabase traffic cannot affect the
    // dashboard waterfall.
    const startedAt = performance.now();
    const starts = new WeakMap();
    const records = [];
    let requestPhase = "before-trainer";

    page.on("request", (request) => {
      const url = new URL(request.url());
      if (trackedRoute(url)) starts.set(request, { startedAt: performance.now(), phase: requestPhase });
    });
    page.on("response", async (response) => {
      const request = response.request();
      const start = starts.get(request);
      if (start === undefined) return;
      await response.finished().catch(() => {});
      const url = new URL(response.url());
      const route = trackedRoute(url);
      if (!route) return;
      records.push({
        route,
        phase: start.phase,
        method: request.method(),
        status: response.status(),
        startMs: Math.round(start.startedAt - startedAt),
        durationMs: Math.round(performance.now() - start.startedAt),
        serverTiming: response.headers()["server-timing"] ?? null,
      });
    });

    // Home intentionally loads its own due count after hydration. Wait for
    // that request before beginning the trainer phase, otherwise a delayed
    // Home effect can be misattributed to /trainer.
    const homeSetupCountsResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/learn/setup-counts" && response.request().method() === "GET";
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await homeSetupCountsResponse;
    requestPhase = "trainer-mount";
    const trainerNavigationStartedAt = performance.now();
    await page.goto("/trainer", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Swahili Flashcards/ })).toBeVisible();
    await expect(page.getByText(/^\d+ heute fällig · \d+ insgesamt$/)).toBeVisible();
    const dashboardReadyMs = Math.round(performance.now() - trainerNavigationStartedAt);

    // These two calls are read-only audit probes, not dashboard-mount work.
    requestPhase = "audit-probes";
    await page.evaluate(async () => {
      await Promise.all([
        fetch("/api/learn/today?type=vocab", { cache: "no-store" }),
        fetch("/api/learn/stats?type=vocab", { cache: "no-store" }),
      ]);
    });
    await page.waitForTimeout(100);

    records.sort((a, b) => a.startMs - b.startMs);
    console.info("[trainer-performance-audit] dashboard_ready_ms", dashboardReadyMs);
    console.info("[trainer-performance-audit] browser-waterfall", JSON.stringify(records));
    const trainerMountRecords = records.filter((record) => record.phase === "trainer-mount");
    const auditProbeRecords = records.filter((record) => record.phase === "audit-probes");
    // Counts arrive with the /trainer server render. Any later counts request
    // would be a regression to the client-side auth/count waterfall.
    expect(trainerMountRecords.some((record) => record.route.startsWith("/api/learn/setup-counts"))).toBe(false);
    expect(trainerMountRecords.some((record) => record.route.startsWith("/api/groups"))).toBe(false);
    expect(trainerMountRecords.some((record) => record.route.startsWith("/api/cards"))).toBe(false);
    expect(trainerMountRecords.some((record) => record.route === "supabase:/auth/v1/user")).toBe(false);
    expect(auditProbeRecords.some((record) => record.route.startsWith("/api/learn/today"))).toBe(true);
    expect(auditProbeRecords.some((record) => record.route.startsWith("/api/learn/stats"))).toBe(true);
  });
});
