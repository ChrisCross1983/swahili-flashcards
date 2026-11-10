import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, from } = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));
import { PATCH } from "./route";

const request = (body: unknown) => new Request("http://localhost/api/cards/notes", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("card notes partial updates", () => {
    let stored: Record<string, unknown> | null;
    const updatePayloads: Array<Record<string, unknown>> = [];
    const noteSelect = vi.fn();

    beforeEach(() => {
        stored = {
            owner_key: "owner-1", card_id: "card-1", main_notes: "Existing note",
            memory_hint: "Hint", example_sentence: "Example", confusion_note: "Confusion",
        };
        updatePayloads.length = 0;
        noteSelect.mockClear();
        requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null });
        from.mockImplementation((table: string) => {
            if (table === "cards") {
                const query = { eq: () => query, maybeSingle: async () => ({ data: { id: "card-1" }, error: null }) };
                return { select: () => query };
            }
            return {
                select: noteSelect,
                update: (changes: Record<string, unknown>) => {
                    updatePayloads.push(changes);
                    const query = {
                        eq: () => query,
                        select: () => query,
                        maybeSingle: async () => {
                            await Promise.resolve();
                            if (!stored) return { data: null, error: null };
                            stored = { ...stored, ...changes };
                            return { data: stored, error: null };
                        },
                    };
                    return query;
                },
                insert: (values: Record<string, unknown>) => ({
                    select: () => ({ single: async () => {
                        await Promise.resolve();
                        if (stored) return { data: null, error: { code: "23505" } };
                        stored = values;
                        return { data: stored, error: null };
                    } }),
                }),
            };
        });
    });

    it("preserves omitted fields and clears only an explicitly empty note", async () => {
        expect((await PATCH(request({ cardId: "card-1", memoryHint: "Changed" }))).status).toBe(200);
        expect(stored).toMatchObject({ main_notes: "Existing note", memory_hint: "Changed", example_sentence: "Example" });
        expect(updatePayloads[0]).toMatchObject({ memory_hint: "Changed" });
        expect(updatePayloads[0]).not.toHaveProperty("main_notes");

        expect((await PATCH(request({ cardId: "card-1", mainNotes: "" }))).status).toBe(200);
        expect(stored).toMatchObject({ main_notes: "", memory_hint: "Changed", example_sentence: "Example" });
        expect(noteSelect).not.toHaveBeenCalled();
    });

    it("keeps both fields from concurrent independent updates", async () => {
        const responses = await Promise.all([
            PATCH(request({ cardId: "card-1", mainNotes: "New note" })),
            PATCH(request({ cardId: "card-1", memoryHint: "New hint" })),
        ]);
        expect(responses.map((response) => response.status)).toEqual([200, 200]);
        expect(stored).toMatchObject({ main_notes: "New note", memory_hint: "New hint", example_sentence: "Example" });
        expect(updatePayloads[0]).not.toHaveProperty("memory_hint");
        expect(updatePayloads[1]).not.toHaveProperty("main_notes");
    });

    it("resolves two concurrent first writes without losing either field", async () => {
        stored = null;
        const responses = await Promise.all([
            PATCH(request({ cardId: "card-1", mainNotes: "New note" })),
            PATCH(request({ cardId: "card-1", memoryHint: "New hint" })),
        ]);
        expect(responses.map((response) => response.status)).toEqual([200, 200]);
        expect(stored).toMatchObject({ main_notes: "New note", memory_hint: "New hint" });
        expect(updatePayloads).toHaveLength(3);
    });
});
