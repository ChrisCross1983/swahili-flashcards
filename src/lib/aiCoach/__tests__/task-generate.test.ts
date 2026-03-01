import { describe, expect, it, vi } from "vitest";
import { generateTask } from "../tasks/generate";

vi.mock("../enrichment/generateEnrichment", () => ({
    getOrCreateEnrichment: vi.fn(async () => ({
        owner_key: "owner-1",
        card_id: "c1",
        type: "vocab",
        pos: "noun",
        noun_class: "ki/vi",
        singular: "kitabu",
        plural: "vitabu",
        examples: [
            { sw: "Ninanunua kitabu kipya.", de: "Ich kaufe ein neues Buch." },
        ],
        mnemonic: null,
        notes: "Achte auf ki/vi im Singular und Plural.",
    })),
}));

describe("generateTask cloze", () => {
    it("uses enrichment example and avoids Ninaona hardcode", async () => {
        const task = await generateTask({
            ownerKey: "owner-1",
            direction: "DE_TO_SW",
            taskType: "cloze",
            card: {
                id: "c1",
                german_text: "Buch",
                swahili_text: "kitabu",
                type: "vocab",
            },
            pool: [
                { id: "c2", german_text: "Haus", swahili_text: "nyumba", type: "vocab" },
                { id: "c3", german_text: "Auto", swahili_text: "gari", type: "vocab" },
            ],
        });

        expect(task.example?.sw).toBe("Ninanunua kitabu kipya.");
        expect(task.example?.de).toBe("Ich kaufe ein neues Buch.");
        expect(task.prompt).not.toContain("Ninaona");
        expect(task.prompt).toContain("Gesuchtes Wort");
        expect(task.ui?.inputMode).toBe("cloze_click");
    });
});
