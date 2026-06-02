import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const bin = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");

if (!existsSync(bin)) {
  console.error("Playwright is not installed locally.");
  console.error("Run: npm install --save-dev @playwright/test && npx playwright install chromium");
  process.exit(1);
}

const args = process.argv.slice(2);
const result = spawnSync(bin, ["test", ...args], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
