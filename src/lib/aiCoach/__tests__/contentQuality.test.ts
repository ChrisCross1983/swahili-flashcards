import { describe, expect, it } from "vitest";
import { getVisibleMorphology, isHighQualityExample, pickVisibleExample, shouldShowHint } from "../contentQuality";

const nounTask = {
    taskId: "t1",
    cardId: "c1",
    type: "translate" as const,
    direction: "DE_TO_SW" as const,
    prompt: "Übersetze: Buch",
    expectedAnswer: "kitabu",
    profile: {
        pos: "noun" as const,
        morphologicalInfo: { nounClass: "ki/vi", singular: "kitabu", plural: "vitabu" },
    },
    meta: { nounClass: "ki/vi", plural: "vitabu" },
    ui: { inputMode: "text" as const },
};

describe("contentQuality", () => {
    it("rejects generic template examples", () => {
        expect(isHighQualityExample(nounTask, { sw: "Im Gespräch sage ich kitabu oft.", de: "Im Gespräch sage ich Buch oft." })).toBe(false);
    });

    it("accepts plausible examples with sw+de", () => {
        expect(isHighQualityExample(nounTask, { sw: "Ninununua kitabu kipya leo.", de: "Ich kaufe heute ein neues Buch." })).toBe(true);
    });

    it("only exposes hint for almost-correct compact hints", () => {
        expect(shouldShowHint({ feedbackTitle: "Fast richtig", learnTip: "Prüfe die Endung." } as never)).toBe(true);
        expect(shouldShowHint({ feedbackTitle: "Noch nicht", learnTip: "Prüfe die Endung." } as never)).toBe(false);
    });

    it("returns noun morphology only when available", () => {
        const morphology = getVisibleMorphology(nounTask as never);
        expect(morphology).toEqual({ nounClass: "ki/vi", singular: "kitabu", plural: "vitabu" });
    });

    it("prefers high-quality examples only", () => {
        const result = {
            feedbackTitle: "Noch nicht",
            example: { sw: "Wir sagen kitabu oft", de: "Wir sagen Buch oft" },
            microLesson: { example: { sw: "Ninapata kitabu mezani.", de: "Ich finde ein Buch auf dem Tisch." } },
        };
        const picked = pickVisibleExample(result as never, nounTask as never);
        expect(picked?.sw).toContain("Ninapata");
    });
});
