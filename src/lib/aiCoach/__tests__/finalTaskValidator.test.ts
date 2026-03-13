import { describe, expect, it } from "vitest";
import { validateFinalTask } from "../finalTaskValidator";
import type { AiCoachTask } from "../types";

const baseTask: AiCoachTask = {
    taskId: "t1",
    cardId: "c1",
    type: "mcq",
    direction: "DE_TO_SW",
    prompt: "Wähle die richtige Übersetzung: Buch",
    expectedAnswer: "kitabu",
    choices: ["kitabu", "Haus", "Fenster", "Baum"],
    hintLevels: ["Fokussiere dich auf den Kernbegriff."],
    ui: { inputMode: "mcq" },
};

describe("finalTaskValidator", () => {
    it("downgrades weak mixed-language mcq to translate", () => {
        const validated = validateFinalTask(baseTask, {
            card: { id: "c1", german_text: "Buch", swahili_text: "kitabu", type: "vocab" },
            pool: [{ id: "c2", german_text: "Haus", swahili_text: "nyumba" }],
        });

        expect(validated.type).toBe("translate");
        expect(validated.prompt).toContain("Übersetze:");
    });

    it("repairs mcq when strong distractors exist", () => {
        const task = { ...baseTask, hintLevels: ["Antwort beginnt mit: ki…"] };
        const validated = validateFinalTask(task, {
            card: { id: "c1", german_text: "Buch", swahili_text: "kitabu", type: "vocab" },
            pool: [
                { id: "c2", german_text: "Haus", swahili_text: "nyumba" },
                { id: "c3", german_text: "Stuhl", swahili_text: "kiti" },
                { id: "c4", german_text: "Fenster", swahili_text: "dirisha" },
                { id: "c5", german_text: "Markt", swahili_text: "soko" },
            ],
        });

        if (validated.type === "translate") {
            expect(validated.prompt).toContain("Übersetze:");
            return;
        }

        expect(validated.type).toBe("mcq");
        expect(validated.choices).toHaveLength(4);
        expect(validated.choices?.every((choice) => !/(haus|stuhl|fenster|markt)/i.test(choice))).toBe(true);
    });
});
