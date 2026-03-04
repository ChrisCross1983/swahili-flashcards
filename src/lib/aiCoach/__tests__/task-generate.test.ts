import { describe, expect, it } from "vitest";
import { buildTask } from "../tasks/generate";

describe("task builder", () => {
    it("falls back from cloze when expected token is missing in examples", () => {
        const task = buildTask({
            direction: "DE_TO_SW",
            taskType: "cloze",
            card: { id: "c1", german_text: "Buch", swahili_text: "kitabu", type: "vocab" },
            enrichment: {
                owner_key: "u1",
                card_id: "c1",
                type: "vocab",
                pos: "noun",
                noun_class: "ki/vi",
                singular: "kitabu",
                plural: "vitabu",
                examples: [{ sw: "Ninaenda sokoni.", de: "Ich gehe zum Markt." }],
                mnemonic: null,
                notes: "",
            },
        });

        expect(task.type).toBe("translate");
    });

    it("builds a clean translate prompt", () => {
        const task = buildTask({
            direction: "DE_TO_SW",
            taskType: "translate",
            card: { id: "c1", german_text: "Haus\nBitte antworte", swahili_text: "nyumba", type: "vocab" },
        });
        expect(task.prompt).toBe("Übersetze: Haus Bitte antworte");
    });

    it("mcq distractors are short and non-empty", () => {
        const task = buildTask({
            direction: "DE_TO_SW",
            taskType: "mcq",
            card: { id: "c1", german_text: "Buch", swahili_text: "kitabu", type: "vocab" },
            pool: [
                { id: "c2", german_text: "Haus", swahili_text: "nyumba", pos: "noun", nounClass: "n/n" },
                { id: "c3", german_text: "", swahili_text: "", pos: "noun", nounClass: "n/n" },
                { id: "c4", german_text: "Langer Satz mit viel zu vielen Zeichen und Erklärungen", swahili_text: "hii ni sentensi ndefu sana mno mno mno", pos: "phrase", nounClass: null },
            ],
        });

        expect(task.choices?.every((choice) => choice.trim().length >= 2 && choice.length <= 32)).toBe(true);
    });
});
