import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, from, getExistingEnrichment, generateWordUnderstanding } = vi.hoisted(() => ({
    requireUser: vi.fn(), from: vi.fn(), getExistingEnrichment: vi.fn(), generateWordUnderstanding: vi.fn(),
}));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));
vi.mock("@/lib/aiCoach/enrichment/generateEnrichment", () => ({ getExistingEnrichment, generateWordUnderstanding }));
import { GET, POST } from "./route";

const example = { sw: "Mlango umefungwa.", de: "Die Tür ist geschlossen." };
const enrichment = {
    owner_key: "owner", card_id: "word-1", type: "vocab", pos: "noun", noun_class: "m/mi",
    singular: "mlango", plural: "milango", examples: [example], mnemonic: null,
    notes: "Im Plural wechselt m- zu mi- und die Kongruenz u- zu i-.",
};
const request = (id = "word-1") => new Request("http://localhost/api/cards/word-explanation", { method: "POST", body: JSON.stringify({ cardId: id }) });

describe("word explanation route", () => {
    const upsert = vi.fn();
    beforeEach(() => {
        vi.clearAllMocks();
        requireUser.mockResolvedValue({ user: { id: "owner" }, response: null });
        getExistingEnrichment.mockResolvedValue(null);
        generateWordUnderstanding.mockResolvedValue(enrichment);
        upsert.mockResolvedValue({ error: null });
        from.mockImplementation((table: string) => {
            if (table === "cards") {
                const query = { eq: () => query, maybeSingle: async () => ({ data: { id: "word-1", german_text: "Tür", swahili_text: "mlango", type: "vocab" }, error: null }) };
                return { select: () => query };
            }
            return { upsert };
        });
    });
    it("GET reads existing enrichment without generating", async () => {
        getExistingEnrichment.mockResolvedValue(enrichment);
        const response = await GET(new Request("http://localhost/api/cards/word-explanation?cardId=word-1"));
        expect(response.status).toBe(200);
        expect((await response.json()).enrichment.noun_class).toBe("m/mi");
        expect(generateWordUnderstanding).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });
    it("POST reuses sufficient enrichment without an AI request", async () => {
        getExistingEnrichment.mockResolvedValue(enrichment);
        const response = await POST(request());
        expect((await response.json()).reused).toBe(true);
        expect(generateWordUnderstanding).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });
    it("regenerates only on an explicit request through the same route", async () => {
        getExistingEnrichment.mockResolvedValue(enrichment);
        const response = await POST(new Request("http://localhost/api/cards/word-explanation", { method: "POST", body: JSON.stringify({ cardId: "word-1", regenerate: true }) }));
        expect(response.status).toBe(200);
        expect(generateWordUnderstanding).toHaveBeenCalledOnce();
        expect(upsert).toHaveBeenCalledOnce();
    });
    it("persists a generated explanation to the original card enrichment", async () => {
        const response = await POST(request());
        expect(response.status).toBe(200);
        expect(generateWordUnderstanding).toHaveBeenCalledWith(expect.objectContaining({ id: "word-1", swahili_text: "mlango" }));
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ owner_key: "owner", card_id: "word-1", noun_class: "m/mi", notes: enrichment.notes }), { onConflict: "owner_key,card_id" });
    });
    it("does not persist invalid generation", async () => {
        generateWordUnderstanding.mockResolvedValue({ ...enrichment, examples: [] });
        const response = await POST(request());
        expect(response.status).toBe(502);
        expect(upsert).not.toHaveBeenCalled();
    });
    it("generates and persists a phrase when no enrichment row exists", async () => {
        const phrase = { ...enrichment, pos: "phrase", noun_class: null, singular: null, plural: null,
            notes: "habari und za asubuhi bilden einen Morgengruß.", examples: [{ sw: "Habari za asubuhi?", de: "Guten Morgen?" }] };
        from.mockImplementation((table: string) => {
            if (table === "cards") {
                const query = { eq: () => query, maybeSingle: async () => ({ data: { id: "phrase-1", german_text: "Guten Morgen", swahili_text: "Habari za asubuhi", type: "vocab" }, error: null }) };
                return { select: () => query };
            }
            return { upsert };
        });
        generateWordUnderstanding.mockResolvedValue(phrase);
        const response = await POST(request("phrase-1"));
        expect(response.status).toBe(200);
        expect(generateWordUnderstanding).toHaveBeenCalledWith(expect.objectContaining({ id: "phrase-1", swahili_text: "Habari za asubuhi", type: "vocab" }));
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ card_id: "phrase-1", pos: "phrase" }), { onConflict: "owner_key,card_id" });
        getExistingEnrichment.mockResolvedValue(phrase);
        const reopened = await GET(new Request("http://localhost/api/cards/word-explanation?cardId=phrase-1"));
        expect(reopened.status).toBe(200);
        expect((await reopened.json()).enrichment.pos).toBe("phrase");
        expect(generateWordUnderstanding).toHaveBeenCalledOnce();
    });
    it("does not report an existing sentence card as missing", async () => {
        from.mockImplementation(() => {
            const query = { eq: () => query, maybeSingle: async () => ({ data: { id: "sentence-1", german_text: "Guten Morgen", swahili_text: "Habari za asubuhi", type: "sentence" }, error: null }) };
            return { select: () => query };
        });
        const response = await POST(request("sentence-1"));
        expect(response.status).toBe(422);
        expect(generateWordUnderstanding).not.toHaveBeenCalled();
    });
    it("returns 404 only when the owned card lookup is empty", async () => {
        from.mockImplementation(() => {
            const query = { eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
            return { select: () => query };
        });
        const response = await POST(request("missing-card"));
        expect(response.status).toBe(404);
        expect(generateWordUnderstanding).not.toHaveBeenCalled();
    });
});
