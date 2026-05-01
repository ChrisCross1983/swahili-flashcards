import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..", "..");

describe("useTrainerSession extraction contract", () => {
    it("defines hook and core runtime APIs", () => {
        const source = fs.readFileSync(path.join(root, "src/lib/trainer/useTrainerSession.ts"), "utf8");
        expect(source).toContain("export function useTrainerSession");
        expect(source).toContain("startLearningSession");
        expect(source).toContain("gradeCurrent");
        expect(source).toContain("revealCard");
        expect(source).toContain("endSessionEarly");
        expect(source).toContain("applyDeletedCards");
    });
});
