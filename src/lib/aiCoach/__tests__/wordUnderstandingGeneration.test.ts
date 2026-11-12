import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWordUnderstanding } from "../enrichment/generateEnrichment";

const originalKey = process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;
afterEach(() => { if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; globalThis.fetch = originalFetch; });

describe("explicit word understanding generation", () => {
    it("uses structured output in the existing enrichment shape and keeps uncertain fields empty", async () => {
        process.env.OPENAI_API_KEY = "test-key";
        const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({
            pos: "phrase", noun_class: null, singular: null, plural: null,
            examples: [{ sw: "Habari za asubuhi!", de: "Guten Morgen!", changedForms: [] }], mnemonic: null,
            notes: "Habari bezeichnet Nachrichten; za verbindet es mit asubuhi.",
        }) }) });
        globalThis.fetch = mock;
        const result = await generateWordUnderstanding({ id: "phrase-1", swahili_text: "Habari za asubuhi", german_text: "Guten Morgen", type: "vocab" });
        expect(result?.pos).toBe("phrase");
        expect(result?.noun_class).toBeNull();
        expect(result?.examples).toHaveLength(1);
        const request = JSON.parse(mock.mock.calls[0][1].body as string);
        expect(request.text.format.type).toBe("json_schema");
        expect(request.text.format.strict).toBe(true);
        expect(request.text.format.schema.properties.examples.items.properties.changedForms).toBeDefined();
        expect(request.input[0].content[0].text).toContain("ohne Fachwörter wie Kongruenz");
        expect(request.input[0].content[0].text).toContain("gelernte Swahili-Kartenform");
    });
    it("never persists a local prefix guess when AI is unavailable", async () => {
        delete process.env.OPENAI_API_KEY;
        expect(await generateWordUnderstanding({ id: "noun-1", swahili_text: "mlango", german_text: "Tür", type: "vocab" })).toBeNull();
    });
    it("keeps validated changed forms inside the existing examples JSON", async () => {
        process.env.OPENAI_API_KEY = "test-key";
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({
            pos: "noun", noun_class: "KI-VI", singular: "chumba", plural: "vyumba", mnemonic: null,
            notes: "Auch dieses und groß ändern sich im Plural.", examples: [
                { sw: "Chumba hiki ni kikubwa.", de: "Dieses Zimmer ist groß.", changedForms: [] },
                { sw: "Vyumba hivi ni vikubwa.", de: "Diese Zimmer sind groß.", changedForms: [{ from: "hiki", to: "hivi" }, { from: "kikubwa", to: "vikubwa" }] },
            ],
        }) }) });
        const result = await generateWordUnderstanding({ id: "noun-2", swahili_text: "chumba", german_text: "Zimmer", type: "vocab" });
        expect(result?.examples[1].changedForms).toEqual([{ from: "hiki", to: "hivi" }, { from: "kikubwa", to: "vikubwa" }]);
    });
});
