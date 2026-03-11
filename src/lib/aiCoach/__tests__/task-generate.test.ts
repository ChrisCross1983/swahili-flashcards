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

    it("avoids mcq for greeting/phrase cards when translation is suitable", () => {
        const task = buildTask({
            direction: "DE_TO_SW",
            taskType: "mcq",
            card: { id: "c9", german_text: "Vielen Dank", swahili_text: "asante sana", type: "vocab" },
            pool: [
                { id: "c2", german_text: "Haus", swahili_text: "nyumba" },
                { id: "c3", german_text: "Buch", swahili_text: "kitabu" },
            ],
        });

        expect(task.type).toBe("translate");
    });

    it("falls back to safe non-junk type when cloze is unsuitable", () => {
        const task = buildTask({
            direction: "DE_TO_SW",
            objective: "guidedRecall",
            taskType: "cloze",
            card: { id: "c10", german_text: "Hallo", swahili_text: "hujambo", type: "vocab" },
        });

        expect(task.type).toBe("translate");
    });

    it("rejects generic template examples for task output", () => {
        const task = buildTask({
            direction: "DE_TO_SW",
            taskType: "translate",
            card: { id: "c1", german_text: "Avocado", swahili_text: "parachichi", type: "vocab" },
            enrichment: {
                owner_key: "u1",
                card_id: "c1",
                type: "vocab",
                pos: "noun",
                noun_class: null,
                singular: "parachichi",
                plural: null,
                examples: [{ sw: "Im Gespräch sage ich parachichi häufig.", de: "Im Gespräch sage ich Avocado häufig." }],
                mnemonic: null,
                notes: "",
            },
        });

        expect(task.example).toBeUndefined();
    });

    it("falls back safely when validated mcq pool is insufficient", () => {
        const task = buildTask({
            direction: "DE_TO_SW",
            taskType: "mcq",
            card: { id: "c11", german_text: "Baum", swahili_text: "mti", type: "vocab" },
            pool: [
                { id: "c2", german_text: "Haus", swahili_text: "Haus" },
                { id: "c3", german_text: "Fenster", swahili_text: "Fenster" },
            ],
        });

        if (task.type === "translate") {
            expect(task.prompt).toContain("Übersetze:");
            return;
        }

        expect(task.type).toBe("mcq");
        expect(task.choices).toHaveLength(4);
        expect(task.choices?.every((choice) => !/(haus|fenster)/i.test(choice) || /^[A-ZÄÖÜa-zäöüß]+$/.test(choice))).toBe(true);
    });

    it("keeps SW_TO_DE mcq choices in German only", () => {
        const task = buildTask({
            direction: "SW_TO_DE",
            taskType: "mcq",
            card: { id: "c12", german_text: "Buch", swahili_text: "kitabu", type: "vocab" },
            pool: [
                { id: "c2", german_text: "Haus", swahili_text: "nyumba" },
                { id: "c3", german_text: "Freund", swahili_text: "rafiki" },
                { id: "c4", german_text: "Fenster", swahili_text: "dirisha" },
                { id: "c5", german_text: "Stuhl", swahili_text: "kiti" },
            ],
        });

        expect(task.type).toBe("mcq");
        expect(task.choices?.every((choice) => !/(kitabu|nyumba|rafiki|dirisha|kiti)/i.test(choice))).toBe(true);
    });
});
