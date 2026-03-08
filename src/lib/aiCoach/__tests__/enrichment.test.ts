import { describe, expect, it } from "vitest";
import { generateEnrichment } from "../enrichment/generateEnrichment";

describe("generateEnrichment", () => {
    it("does not inject fallback template examples without validated quality", async () => {
        const original = process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_API_KEY;

        const enrichment = await generateEnrichment("owner-1", {
            id: "card-1",
            german_text: "Paprika",
            swahili_text: "pilipili hoho",
            type: "vocab",
        });

        expect(enrichment.examples).toEqual([]);

        process.env.OPENAI_API_KEY = original;
    });
});
