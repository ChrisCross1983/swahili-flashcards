import { describe, expect, it } from "vitest";
import { buildDeterministicExplanation, filterHintLevels, isSpecificHintText } from "../hintQuality";

describe("hintQuality", () => {
    it("rejects generic hints", () => {
        expect(isSpecificHintText("Fokussiere dich auf den Kernbegriff.")).toBe(false);
        expect(isSpecificHintText("Antwort beginnt mit: k.")).toBe(true);
        expect(isSpecificHintText("Plural: vitabu.")).toBe(false);
    });

    it("filters vague hint levels", () => {
        const filtered = filterHintLevels(["Wenn unsicher: erst Stammwort, dann Endung ergänzen.", "Nominalklasse beachten: ki/vi.", "Erster Buchstabe: k."]);
        expect(filtered).toEqual(["Nominalklasse beachten: ki/vi."]);
    });

    it("builds concrete explanation by error type", () => {
        const explanation = buildDeterministicExplanation({
            taskId: "t1",
            cardId: "c1",
            type: "translate",
            direction: "DE_TO_SW",
            prompt: "Übersetze: Buch",
            expectedAnswer: "kitabu",
            profile: { unitType: "phrase" } as any,
        }, "semantic_confusion");

        expect(explanation).toContain("feste Wendung");
    });
});
