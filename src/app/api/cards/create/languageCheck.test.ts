import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, from, getOrCheckSentenceLanguages, SentenceLanguageRateLimitError } = vi.hoisted(() => ({
  requireUser: vi.fn(), from: vi.fn(), getOrCheckSentenceLanguages: vi.fn(), SentenceLanguageRateLimitError: class extends Error {},
}));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));
vi.mock("@/lib/sentence/languageCheck", () => ({ getOrCheckSentenceLanguages, SentenceLanguageRateLimitError }));
import { POST } from "./route";

const request = (body: unknown) => new Request("http://localhost/api/cards/create", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const sentence = { type: "sentence", front_text: "Guten Morgen", back_text: "Habari za asubuhi", front_lang: "de", back_lang: "sw" };

describe("AI chat sentence card creation language boundary", () => {
  const insert = vi.fn();
  beforeEach(() => {
    requireUser.mockResolvedValue({ user: { id: crypto.randomUUID() }, response: null });
    getOrCheckSentenceLanguages.mockReset().mockResolvedValue({ status: "ok" });
    insert.mockReset().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "card-1" }, error: null }) }) });
    from.mockImplementation((table: string) => table === "card_progress"
      ? { insert: async () => ({ error: null }) }
      : { select: () => ({ eq: async () => ({ data: [], error: null }) }), insert });
  });

  it("rejects a confirmed swapped sentence before insert", async () => {
    getOrCheckSentenceLanguages.mockResolvedValueOnce({ status: "input_issue", reason: "likely_swapped" });
    const response = await POST(request({ ...sentence, front_text: "Habari za asubuhi", back_text: "Guten Morgen" }));
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("sentence_language_mismatch");
    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts a confirmed correct sentence and leaves vocabulary creation untouched", async () => {
    expect((await POST(request(sentence))).status).toBe(200);
    expect(getOrCheckSentenceLanguages).toHaveBeenCalledWith(expect.any(String), "Guten Morgen", "Habari za asubuhi");
    expect((await POST(request({ ...sentence, type: "vocab" }))).status).toBe(200);
    expect(getOrCheckSentenceLanguages).toHaveBeenCalledTimes(1);
  });
});
