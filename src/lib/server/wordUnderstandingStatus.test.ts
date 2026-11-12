import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, inCards } = vi.hoisted(() => ({ from: vi.fn(), inCards: vi.fn() }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));
import { getWordUnderstandingByCard } from "./wordUnderstandingStatus";

describe("library word explanation status", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const query = { eq: () => query, in: inCards };
        from.mockReturnValue({ select: () => query });
    });
    it("loads sufficient enrichment once and leaves incomplete and sentence rows inactive", async () => {
        inCards.mockResolvedValue({ data: [
            { card_id: "word-1", pos: "noun", noun_class: "ki/vi", singular: "chumba", plural: "vyumba", examples: [{ sw: "Chumba hiki ni kikubwa.", de: "Dieses Zimmer ist groß." }], notes: "Die Form ändert sich im Plural.", mnemonic: null },
            { card_id: "word-2", pos: "noun", noun_class: "m/mi", singular: "mlango", plural: "milango", examples: [], notes: "Nur ein Hinweis.", mnemonic: null },
        ], error: null });
        const result = await getWordUnderstandingByCard("owner", [{ id: "word-1", type: "vocab" }, { id: "word-2", type: "vocab" }, { id: "sentence-1", type: "sentence" }]);
        expect(from).toHaveBeenCalledWith("ai_card_enrichment");
        expect(inCards).toHaveBeenCalledWith("card_id", ["word-1", "word-2"]);
        expect(result.has("word-1")).toBe(true);
        expect(result.has("word-2")).toBe(false);
        expect(result.has("sentence-1")).toBe(false);
    });
});
