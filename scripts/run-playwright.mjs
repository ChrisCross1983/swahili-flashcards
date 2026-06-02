import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const bin = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");
const envLocal = join(process.cwd(), ".env.local");

if (existsSync(envLocal)) {
  const lines = readFileSync(envLocal, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] != null) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}

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
