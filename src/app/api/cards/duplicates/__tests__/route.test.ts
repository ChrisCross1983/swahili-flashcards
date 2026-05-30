import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("/api/cards/duplicates route", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/cards/duplicates/route.ts"), "utf8");

    it("uses the shared card type filter so vocab includes legacy null-type cards", () => {
        expect(source).toContain("applyCardTypeFilter");
        expect(source).toContain("resolveCardTypeFilter(searchParams.get(\"type\")) ?? \"vocab\"");
        expect(source).not.toContain(".eq(\"type\", cardType)");
    });

    it("keeps sentence filtering delegated to shared type filtering", () => {
        expect(source).toContain("query = applyCardTypeFilter(query, cardType)");
    });
});
