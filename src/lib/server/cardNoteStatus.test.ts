import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));
import { getCardNotePresence, getCardNotes } from "./cardNoteStatus";

describe("card note status across the examples migration", () => {
    beforeEach(() => {
        from.mockClear();
        const rows = [
            { card_id: "legacy", main_notes: "", example_sentence: "Old example" },
            { card_id: "migrated", main_notes: "Beispiele:\n- Old example", example_sentence: "Old example", examples_migration_version: 1 },
            { card_id: "cleared", main_notes: "", example_sentence: "Old example", examples_migration_version: 1 },
            { card_id: "sentence", main_notes: "", memory_hint: "Remember this" },
        ];
        from.mockImplementation(() => {
            const query = {
                select: () => query,
                eq: () => query,
                in: async (_column: string, ids: string[]) => ({ data: rows.filter((row) => ids.includes(row.card_id)), error: null }),
            };
            return query;
        });
    });

    it("uses main_notes for vocabulary before and after migration while preserving sentence note fields", async () => {
        const cards = [
            { id: "legacy", type: "vocab", german_example: "Old example" },
            { id: "migrated", type: "vocab" },
            { id: "cleared", type: "vocab" },
            { id: "sentence", type: "sentence" },
        ];
        const present = await getCardNotePresence("owner-1", cards);
        expect([...present].sort()).toEqual(["migrated", "sentence"]);
    });

    it("loads note status and preview together in one batch without per-card queries", async () => {
        const notes = await getCardNotes("owner-1", [{ id: "legacy" }, { id: "migrated" }, { id: "sentence" }]);
        expect(from).toHaveBeenCalledTimes(1);
        expect(notes.get("migrated")?.main_notes).toBe("Beispiele:\n- Old example");
        expect(notes.get("sentence")?.memory_hint).toBe("Remember this");
        expect(notes.get("missing")).toBeUndefined();
    });
});
