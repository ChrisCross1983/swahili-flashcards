import { describe, expect, it } from "vitest";
import { parseExampleMarkup, sanitizeExampleMarkup, wrapSelectionWithMarker } from "@/lib/examples/formatting";

describe("example formatting helpers", () => {
    it("sanitizes html-like input", () => {
        expect(sanitizeExampleMarkup(" <b>kitabu</b> ")).toBe("bkitabu/b");
    });

    it("wraps selected text with the requested marker", () => {
        const next = wrapSelectionWithMarker("Ninasoma kitabu", 9, 15, "==");
        expect(next.value).toBe("Ninasoma ==kitabu==");
    });

    it("parses only supported inline markers", () => {
        const parsed = parseExampleMarkup("Nina **soma** __sana__ ==leo==.");
        expect(parsed.map((entry) => entry.style)).toEqual(["plain", "bold", "plain", "underline", "plain", "mark", "plain"]);
    });
});
