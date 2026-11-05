import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, from, getOrCheckSentenceLanguages, SentenceLanguageRateLimitError } = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn(), getOrCheckSentenceLanguages: vi.fn(), SentenceLanguageRateLimitError: class extends Error {} }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));
vi.mock("@/lib/sentence/languageCheck", () => ({ getOrCheckSentenceLanguages, SentenceLanguageRateLimitError }));
import { POST, PATCH } from "./route";

const owner = "123e4567-e89b-12d3-a456-426614174111";
const explanation = { version: 1, naturalTranslation: "Was bedeutet das?", breakdown: [
  { surface: "Hilo", meaning: "das", explanation: "Demonstrativ." },
  { surface: "linamaanisha", meaning: "bedeutet", explanation: "Verbform." },
  { surface: "nini?", meaning: "was", explanation: "Fragewort." },
], learningTip: null };
const input = { type: "sentence", german: "Was bedeutet das?", swahili: "Hilo linamaanisha nini?" };
const request = (method: string, body: unknown) => new Request("http://localhost/api/cards", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("sentence explanation persistence", () => {
  let inserted: Record<string, unknown>[];
  let updated: Record<string, unknown>[];
  let stored: Record<string, unknown>;
  let existingRows: Array<{ id: string; german_text: string; swahili_text: string }>;
  beforeEach(() => {
    requireUser.mockResolvedValue({ user: { id: owner }, response: null });
    getOrCheckSentenceLanguages.mockReset().mockResolvedValue({ status: "ok" });
    inserted = []; updated = [];
    stored = { id: "card-1", type: "sentence", german_text: input.german, swahili_text: input.swahili, sentence_explanation: null };
    existingRows = [];
    from.mockImplementation((table: string) => {
      if (table === "card_progress") return { insert: async () => ({ error: null }) };
      return {
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          stored = { ...stored, ...row };
          return { select: () => ({ single: async () => ({ data: stored, error: null }) }) };
        },
        select: () => {
          const query = {
            eq: () => query,
            single: async () => ({ data: stored, error: null }),
            then: (resolve: (value: { data: typeof existingRows; error: null }) => unknown) => Promise.resolve({ data: existingRows, error: null }).then(resolve),
          };
          return query;
        },
        update: (row: Record<string, unknown>) => {
          updated.push(row);
          stored = { ...stored, ...row };
          return { eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: stored, error: null }) }) }) }) };
        },
      };
    });
  });

  it("creates a sentence with or without explanation and returns stored JSON", async () => {
    const withExplanation = await POST(request("POST", { ...input, sentenceExplanation: explanation }));
    expect(withExplanation.status).toBe(200);
    expect(inserted[0].sentence_explanation).toEqual(explanation);
    expect((await withExplanation.json()).card.sentence_explanation).toEqual(explanation);
    const without = await POST(request("POST", input));
    expect(without.status).toBe(200);
    expect(inserted[1].sentence_explanation).toBeNull();
    expect(getOrCheckSentenceLanguages).toHaveBeenCalledWith(owner, input.german, input.swahili);
  });

  it("blocks a confirmed swapped pair on direct POST without opening grammar", async () => {
    getOrCheckSentenceLanguages.mockResolvedValueOnce({ status: "input_issue", reason: "likely_swapped" });
    const response = await POST(request("POST", { type: "sentence", german: "Habari za asubuhi", swahili: "Guten Morgen" }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "sentence_language_mismatch", reason: "likely_swapped" });
    expect(inserted).toHaveLength(0);
  });

  it("rejects oversized sentence input before asking the language provider", async () => {
    expect((await POST(request("POST", { ...input, german: "x".repeat(501) }))).status).toBe(400);
    expect(getOrCheckSentenceLanguages).not.toHaveBeenCalled();
  });

  it("allows a corrected pair and ambiguous single words", async () => {
    expect((await POST(request("POST", { type: "sentence", german: "Guten Morgen", swahili: "Habari za asubuhi" }))).status).toBe(200);
    expect((await POST(request("POST", { type: "sentence", german: "Mama", swahili: "Mama" }))).status).toBe(200);
    expect(inserted).toHaveLength(2);
  });

  it("fails closed on provider errors without exposing provider details", async () => {
    getOrCheckSentenceLanguages.mockRejectedValueOnce(new Error("private provider detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(request("POST", input));
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toContain("private provider detail");
      expect(inserted).toHaveLength(0);
    } finally { log.mockRestore(); }
  });

  it("checks changed sentence text on PATCH before updating", async () => {
    getOrCheckSentenceLanguages.mockResolvedValueOnce({ status: "input_issue", reason: "likely_swapped" });
    const response = await PATCH(request("PATCH", { id: "card-1", german: "Habari za asubuhi", swahili: "Guten Morgen" }));
    expect(response.status).toBe(422);
    expect(updated).toHaveLength(0);
  });

  it("replaces and removes an existing explanation", async () => {
    const replace = await PATCH(request("PATCH", { id: "card-1", ...input, sentenceExplanation: explanation }));
    expect(replace.status).toBe(200);
    expect(updated[0].sentence_explanation).toEqual(explanation);
    const remove = await PATCH(request("PATCH", { id: "card-1", ...input, sentenceExplanation: null }));
    expect(remove.status).toBe(200);
    expect(updated[1].sentence_explanation).toBeNull();
  });

  it("drops a stale explanation when the sentence text changes", async () => {
    stored.sentence_explanation = explanation;
    const response = await PATCH(request("PATCH", { id: "card-1", german: "Was heißt das?" }));
    expect(response.status).toBe(200);
    expect(updated[0].sentence_explanation).toBeNull();
  });

  it("rejects explanations on vocabulary cards", async () => {
    expect((await POST(request("POST", { ...input, type: "vocab", sentenceExplanation: explanation }))).status).toBe(400);
    stored.type = "vocab";
    expect((await PATCH(request("PATCH", { id: "card-1", sentenceExplanation: explanation }))).status).toBe(400);
    expect(updated).toHaveLength(0);
  });

  it("rejects a normalized sentence duplicate at the final API save boundary", async () => {
    existingRows = [{ id: "existing", german_text: "  WAS   bedeutet das? ", swahili_text: "HILO linamaanisha NINI?" }];
    const response = await POST(request("POST", input));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("duplicate_sentence");
    expect(inserted).toHaveLength(0);
    existingRows = [{ id: "existing", german_text: "Was bedeutet das heute?", swahili_text: input.swahili }];
    expect((await POST(request("POST", input))).status).toBe(200);
  });

  it("blocks editing a sentence into another card's pair but excludes itself", async () => {
    existingRows = [{ id: "other", german_text: input.german, swahili_text: input.swahili }];
    expect((await PATCH(request("PATCH", { id: "card-1", ...input }))).status).toBe(409);
    expect(updated).toHaveLength(0);
    existingRows = [{ id: "card-1", german_text: input.german, swahili_text: input.swahili }];
    expect((await PATCH(request("PATCH", { id: "card-1", ...input }))).status).toBe(200);
  });
});
