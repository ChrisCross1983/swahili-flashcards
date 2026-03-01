import { describe, expect, it } from "vitest";
import { generateEnrichment } from "../enrichment/generateEnrichment";

describe("generateEnrichment fallback", () => {
    it("returns bilingual examples with sw+de", async () => {
        const original = process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_API_KEY;

        const enrichment = await generateEnrichment("owner-1", {
            id: "card-1",
            german_text: "Paprika",
            swahili_text: "pilipili hoho",
            type: "vocab",
        });

        expect(enrichment.examples.length).toBeGreaterThan(0);
        enrichment.examples.forEach((example) => {
            expect(example.sw.trim().length).toBeGreaterThan(0);
            expect(example.de.trim().length).toBeGreaterThan(0);
        });

        process.env.OPENAI_API_KEY = original;
    });
});
