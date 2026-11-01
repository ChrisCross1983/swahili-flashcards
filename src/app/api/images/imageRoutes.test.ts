import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("remote image import removal", () => {
  it("has no active legacy import or suggestion routes", () => {
    const root = path.join(process.cwd(), "src/app/api/images");
    expect(fs.existsSync(path.join(root, "import/route.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "suggest/route.ts"))).toBe(false);
  });
});
