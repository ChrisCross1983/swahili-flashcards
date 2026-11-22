/* eslint-disable @typescript-eslint/no-require-imports */
const { defineConfig, devices } = require("@playwright/test");

const baseURL = process.env.PLAYWRIGHT_HEALTH_BASE_URL || "http://127.0.0.1:3101";

module.exports = defineConfig({
  testDir: "./e2e",
  testMatch: "admin-health.spec.cjs",
  timeout: 45_000,
  expect: { timeout: 7_500 },
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "health-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3101",
    env: { ...process.env, PLAYWRIGHT_ADMIN_HEALTH_TEST: "1" },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
