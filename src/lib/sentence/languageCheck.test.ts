import { beforeEach, describe, expect, it, vi } from "vitest";

const { detectLiveLanguageOnServer } = vi.hoisted(() => ({ detectLiveLanguageOnServer: vi.fn() }));
vi.mock("@/lib/translator/live/server/languageDetector", () => ({ detectLiveLanguageOnServer }));
import { checkSentenceLanguages, getCachedSentenceLanguageCheck, getOrCheckSentenceLanguages, SentenceLanguageRateLimitError } from "./languageCheck";

const reversed = [
  ["Habari za asubuhi", "Guten Morgen"],
  ["Ninakuja kesho", "Ich komme morgen"],
  ["Watoto wanacheza nje", "Die Kinder spielen draußen"],
] as const;
const correct = reversed.map(([german, swahili]) => [swahili, german] as const);

describe("sentence language confirmation", () => {
  beforeEach(() => detectLiveLanguageOnServer.mockReset());

  it.each(reversed)("blocks a confirmed swapped pair: %s / %s", async (german, swahili) => {
    detectLiveLanguageOnServer.mockResolvedValueOnce("sw").mockResolvedValueOnce("de");
    expect(await checkSentenceLanguages(german, swahili)).toEqual({ status: "input_issue", reason: "likely_swapped" });
    expect(detectLiveLanguageOnServer).toHaveBeenCalledTimes(2);
  });

  it.each(correct)("allows a confirmed correct pair: %s / %s", async (german, swahili) => {
    detectLiveLanguageOnServer.mockResolvedValueOnce("de").mockResolvedValueOnce("sw");
    expect(await checkSentenceLanguages(german, swahili)).toEqual({ status: "ok" });
    expect(detectLiveLanguageOnServer).toHaveBeenCalledTimes(2);
  });

  it("allows uncertain classifications and isolated ambiguous words", async () => {
    detectLiveLanguageOnServer.mockResolvedValueOnce("unknown").mockResolvedValueOnce("de");
    expect(await checkSentenceLanguages("Habari za asubuhi", "Guten Morgen")).toEqual({ status: "ok" });
    detectLiveLanguageOnServer.mockClear();
    for (const word of ["Mama", "Safari", "Radio"]) {
      expect(await checkSentenceLanguages(word, "Ein Wort")).toEqual({ status: "ok" });
    }
    expect(detectLiveLanguageOnServer).not.toHaveBeenCalled();
  });

  it("blocks two confidently same-language fields", async () => {
    detectLiveLanguageOnServer.mockResolvedValueOnce("de").mockResolvedValueOnce("de");
    expect(await checkSentenceLanguages("Ich komme morgen", "Guten Morgen")).toEqual({ status: "input_issue", reason: "language_mismatch" });
  });

  it("reuses a current per-user pair result and rechecks after correction", async () => {
    detectLiveLanguageOnServer.mockResolvedValueOnce("sw").mockResolvedValueOnce("de")
      .mockResolvedValueOnce("de").mockResolvedValueOnce("sw");
    const owner = crypto.randomUUID();
    expect(await getOrCheckSentenceLanguages(owner, ...reversed[0])).toEqual({ status: "input_issue", reason: "likely_swapped" });
    expect(await getCachedSentenceLanguageCheck(owner, ...reversed[0])).toEqual({ status: "input_issue", reason: "likely_swapped" });
    expect(await getOrCheckSentenceLanguages(owner, ...correct[0])).toEqual({ status: "ok" });
    expect(detectLiveLanguageOnServer).toHaveBeenCalledTimes(4);
  });

  it("does not cache provider failures", async () => {
    const owner = crypto.randomUUID();
    detectLiveLanguageOnServer.mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValue("de");
    await expect(getOrCheckSentenceLanguages(owner, "Ein deutscher Satz", "Mimi ninakuja kesho")).rejects.toThrow("provider unavailable");
    expect(getCachedSentenceLanguageCheck(owner, "Ein deutscher Satz", "Mimi ninakuja kesho")).toBeNull();
  });

  it("limits uncached checks per user while allowing a cached save confirmation", async () => {
    const owner = crypto.randomUUID();
    detectLiveLanguageOnServer.mockResolvedValue("unknown");
    for (let index = 0; index < 60; index++) {
      expect(await getOrCheckSentenceLanguages(owner, `Ein deutscher Satz ${index}`, "Mimi ninakuja kesho")).toEqual({ status: "ok" });
    }
    await expect(getOrCheckSentenceLanguages(owner, "Ein weiterer deutscher Satz", "Mimi ninakuja kesho")).rejects.toBeInstanceOf(SentenceLanguageRateLimitError);
    expect(await getOrCheckSentenceLanguages(owner, "Ein deutscher Satz 0", "Mimi ninakuja kesho")).toEqual({ status: "ok" });
    expect(await getOrCheckSentenceLanguages(owner, "Safari", "Radio")).toEqual({ status: "ok" });
    expect(detectLiveLanguageOnServer).toHaveBeenCalledTimes(120);
  });
});
