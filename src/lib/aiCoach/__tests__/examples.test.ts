import { describe, expect, it } from "vitest";
import { buildExampleSentence } from "../examples";

describe("examples", () => {
    it("always returns sw and de", () => {
        const example = buildExampleSentence({ id: "1", swahili_text: "kitabu", german_text: "Buch" }, "DE_TO_SW");
        expect(example.sw.length).toBeGreaterThan(0);
        expect(example.de.length).toBeGreaterThan(0);
    });
});
