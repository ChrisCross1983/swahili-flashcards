import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TRANSLATOR_FEEDBACK_COMMENT_LENGTH } from "@/lib/translator/feedback";

const requireUserMock = vi.fn();
const fromMock = vi.fn();
const upsertMock = vi.fn();
const selectMock = vi.fn();
const singleMock = vi.fn();

vi.mock("@/lib/api/auth", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/supabaseServer", () => ({
  supabaseServer: { from: fromMock },
}));

const validFeedback = {
  translationEntryId: "translation-1",
  rating: "problem",
  categories: ["translation_wrong", "overall_too_slow"],
  comment: "Die Übersetzung klingt unnatürlich.",
  sourceLanguage: "de",
  targetLanguage: "sw",
  mode: "auto",
  originalText: "Wie geht es dir?",
  translatedText: "Habari yako?",
  diagnostics: {
    transcriptionModel: "gpt-4o-mini-transcribe",
    translationModel: "gpt-5.6-terra",
    ttsModel: "gpt-4o-mini-tts",
    transcriptionMs: 1200,
    autoTranslateMs: 800,
    totalMs: 2000,
    ttsGenerationMs: 450,
    ttsSpeed: 1,
    transcriptionFallbackUsed: false,
    detectedLanguage: "de",
    autoplayEnabled: true,
    autoplayBlocked: false,
  },
  owner_key: "attacker-controlled",
  apiKey: "must-not-be-stored",
  prompt: "must-not-be-stored",
};

async function post(body: unknown) {
  const { POST } = await import("../route");
  return POST(
    new Request("http://localhost/api/translator/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/translator/feedback", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    fromMock.mockReset();
    upsertMock.mockReset();
    selectMock.mockReset();
    singleMock.mockReset();

    requireUserMock.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });
    singleMock.mockResolvedValue({ data: { id: "feedback-1" }, error: null });
    selectMock.mockReturnValue({ single: singleMock });
    upsertMock.mockReturnValue({ select: selectMock });
    fromMock.mockReturnValue({ upsert: upsertMock });
  });

  it("returns 401 before writing for an unauthenticated request", async () => {
    requireUserMock.mockResolvedValue({
      user: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await post(validFeedback);

    expect(response.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("stores valid feedback with the server-side owner and safe diagnostics", async () => {
    const response = await post(validFeedback);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      saved: true,
      feedbackId: "feedback-1",
    });
    expect(fromMock).toHaveBeenCalledWith("translator_feedback");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_key: "user-1",
        translation_entry_id: "translation-1",
        rating: "problem",
        categories: ["translation_wrong", "overall_too_slow"],
        original_text: "Wie geht es dir?",
        translated_text: "Habari yako?",
        transcription_model: "gpt-4o-mini-transcribe",
        translation_model: "gpt-5.6-terra",
        tts_model: "gpt-4o-mini-tts",
        auto_translate_ms: 800,
        tts_speed: 1,
        autoplay_blocked: false,
      }),
      { onConflict: "owner_key,translation_entry_id" },
    );
    const stored = upsertMock.mock.calls[0][0];
    expect(stored.owner_key).not.toBe("attacker-controlled");
    expect(stored).not.toHaveProperty("apiKey");
    expect(stored).not.toHaveProperty("prompt");
  });

  it("rejects an invalid category", async () => {
    const response = await post({
      ...validFeedback,
      categories: ["translation_wrong", "secret_category"],
    });

    expect(response.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a comment above the length limit", async () => {
    const response = await post({
      ...validFeedback,
      comment: "x".repeat(MAX_TRANSLATOR_FEEDBACK_COMMENT_LENGTH + 1),
    });

    expect(response.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects manipulated technical diagnostics", async () => {
    const response = await post({
      ...validFeedback,
      diagnostics: {
        ...validFeedback.diagnostics,
        ttsSpeed: 4,
      },
    });

    expect(response.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("upserts repeated feedback using the owner and entry constraint", async () => {
    await post(validFeedback);
    await post({
      ...validFeedback,
      rating: "good",
      categories: [],
      comment: null,
    });

    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        owner_key: "user-1",
        translation_entry_id: "translation-1",
        rating: "good",
        categories: [],
      }),
      { onConflict: "owner_key,translation_entry_id" },
    );
  });
});
