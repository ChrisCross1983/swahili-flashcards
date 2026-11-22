import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, from, getExistingEnrichment, generateWordUnderstanding } = vi.hoisted(() => ({
    requireUser: vi.fn(), from: vi.fn(), getExistingEnrichment: vi.fn(), generateWordUnderstanding: vi.fn(),
}));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));
vi.mock("@/lib/aiCoach/enrichment/generateEnrichment", () => ({ getExistingEnrichment, generateWordUnderstanding }));
import { DELETE, GET, POST, PUT } from "./route";

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
        process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-preview-signing-secret";
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
        expect((await response.json()).previewToken).toEqual(expect.any(String));
        expect(upsert).not.toHaveBeenCalled();
    });
    it("persists only after accepting the signed preview", async () => {
        const response = await POST(request());
        expect(response.status).toBe(200);
        expect(generateWordUnderstanding).toHaveBeenCalledWith(expect.objectContaining({ id: "word-1", swahili_text: "mlango" }));
        expect(upsert).not.toHaveBeenCalled();
        const { previewToken } = await response.json();
        const accepted = await PUT(new Request("http://localhost/api/cards/word-explanation", { method: "PUT", body: JSON.stringify({ cardId: "word-1", previewToken }) }));
        expect(accepted.status).toBe(200);
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ owner_key: "owner", card_id: "word-1", type: "vocab", noun_class: "m/mi", notes: enrichment.notes }), { onConflict: "owner_key,card_id" });
    });
    it("rejects a foreign or tampered preview without saving", async () => {
        const { previewToken } = await (await POST(request())).json();
        expect((await PUT(new Request("http://localhost/api/cards/word-explanation", { method: "PUT", body: JSON.stringify({ cardId: "another-card", previewToken }) }))).status).toBe(400);
        expect((await PUT(new Request("http://localhost/api/cards/word-explanation", { method: "PUT", body: JSON.stringify({ cardId: "word-1", previewToken: `${previewToken}x` }) }))).status).toBe(400);
        expect(upsert).not.toHaveBeenCalled();
    });
    it("does not persist invalid generation", async () => {
        generateWordUnderstanding.mockResolvedValue({ ...enrichment, examples: [] });
        const response = await POST(request());
        expect(response.status).toBe(502);
        expect(upsert).not.toHaveBeenCalled();
    });
    it("generates a phrase preview and saves it only after acceptance", async () => {
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
        expect(upsert).not.toHaveBeenCalled();
        const { previewToken } = await response.json();
        expect((await PUT(new Request("http://localhost/api/cards/word-explanation", { method: "PUT", body: JSON.stringify({ cardId: "phrase-1", previewToken }) }))).status).toBe(200);
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
    it("removes only the authenticated owner's saved word knowledge", async () => {
        const conditions: Array<[string, string]> = [];
        const deleteQuery = { eq: vi.fn() };
        deleteQuery.eq.mockImplementation((column: string, value: string) => {
            conditions.push([column, value]);
            return conditions.length === 2 ? Promise.resolve({ error: null }) : deleteQuery;
        });
        from.mockImplementation((table: string) => {
            if (table === "cards") {
                const query = { eq: () => query, maybeSingle: async () => ({ data: { id: "word-1", german_text: "Tür", swahili_text: "mlango", type: "vocab" }, error: null }) };
                return { select: () => query };
            }
            return { delete: () => deleteQuery };
        });
        const response = await DELETE(new Request("http://localhost/api/cards/word-explanation", { method: "DELETE", body: JSON.stringify({ cardId: "word-1", user_id: "another-user" }) }));
        expect(response.status).toBe(200);
        expect(conditions).toEqual([["owner_key", "owner"], ["card_id", "word-1"]]);
        getExistingEnrichment.mockResolvedValue(null);
        expect((await (await GET(new Request("http://localhost/api/cards/word-explanation?cardId=word-1"))).json()).enrichment).toBeNull();
    });
    it("rejects unauthenticated, cross-origin and foreign-card deletion", async () => {
        const remove = vi.fn();
        requireUser.mockResolvedValueOnce({ user: null, response: new Response(null, { status: 401 }) });
        expect((await DELETE(new Request("http://localhost/api/cards/word-explanation", { method: "DELETE", body: JSON.stringify({ cardId: "word-1" }) }))).status).toBe(401);
        expect((await DELETE(new Request("http://localhost/api/cards/word-explanation", { method: "DELETE", headers: { origin: "https://other.example" }, body: JSON.stringify({ cardId: "word-1" }) }))).status).toBe(403);
        from.mockImplementation((table: string) => {
            if (table === "cards") {
                const query = { eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
                return { select: () => query };
            }
            return { delete: remove };
        });
        expect((await DELETE(new Request("http://localhost/api/cards/word-explanation", { method: "DELETE", body: JSON.stringify({ cardId: "foreign-card" }) }))).status).toBe(404);
        expect(remove).not.toHaveBeenCalled();
    });
    it("keeps saved word knowledge when deletion fails", async () => {
        from.mockImplementation((table: string) => {
            if (table === "cards") {
                const query = { eq: () => query, maybeSingle: async () => ({ data: { id: "word-1", german_text: "Tür", swahili_text: "mlango", type: "vocab" }, error: null }) };
                return { select: () => query };
            }
            const query = { eq: () => query, then: (resolve: (value: { error: { code: string } }) => void) => resolve({ error: { code: "db_down" } }) };
            return { delete: () => query };
        });
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            expect((await DELETE(new Request("http://localhost/api/cards/word-explanation", { method: "DELETE", body: JSON.stringify({ cardId: "word-1" }) }))).status).toBe(500);
        } finally { log.mockRestore(); }
    });
});
