const { defineConfig, devices } = require("@playwright/test");

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 7_500,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
