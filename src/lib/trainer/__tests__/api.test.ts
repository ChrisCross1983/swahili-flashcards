import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAllCardsForDrill } from "@/lib/trainer/api";

describe("trainer api", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("maps all cards payload into drill items", async () => {
        vi.stubGlobal("fetch", vi.fn(async () =>
            new Response(JSON.stringify({
                cards: [
                    { id: "1", german_text: "Haus", swahili_text: "nyumba", german_example: null, swahili_example: null, image_path: null, audio_path: null, groups: [] },
                    { id: "2", german_text: "Wasser", swahili_text: "maji", german_example: "Ich trinke ==Wasser==.", swahili_example: "Ninakunywa ==maji==.", image_path: "img/2", audio_path: "audio/2", groups: [{ id: "g1", name: "Basics" }] },
                ],
            }), { status: 200 })
        ));

        const items = await fetchAllCardsForDrill("vocab");

        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ cardId: "1", german: "Haus", swahili: "nyumba" });
        expect(items[1]).toMatchObject({ cardId: "2", german_example: "Ich trinke ==Wasser==.", swahili_example: "Ninakunywa ==maji==.", imagePath: "img/2", audio_path: "audio/2" });
    });

    it("surfaces backend errors with status for all-cards drill load", async () => {
        vi.stubGlobal("fetch", vi.fn(async () =>
            new Response(JSON.stringify({ error: "Karten konnten nicht vollständig geladen werden (Gruppen)." }), { status: 500 })
        ));

        await expect(fetchAllCardsForDrill("vocab")).rejects.toThrow("Karten konnten nicht vollständig geladen werden (Gruppen). (HTTP 500)");
    });

    it("fails loudly for invalid JSON to avoid silent no-op start", async () => {
        vi.stubGlobal("fetch", vi.fn(async () =>
            new Response("<!doctype html>", { status: 200 })
        ));

        await expect(fetchAllCardsForDrill("vocab")).rejects.toThrow("ungültige Antwort vom Server");
    });
});
