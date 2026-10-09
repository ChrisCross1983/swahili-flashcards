import { afterEach, describe, expect, it, vi } from "vitest";

async function spikeFlag() {
  vi.resetModules();
  const config = (await import("../../../../next.config")).default;
  return config.env?.NEXT_PUBLIC_TRANSLATOR_FIRST_SENTENCE_FAST_TTS;
}

describe("first-sentence speech preview gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is enabled only for the designated preview branch", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "spike/first-sentence-fast-tts");
    expect(await spikeFlag()).toBe("true");
  });

  it("cannot be enabled in production, including by a project-wide public flag", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "spike/first-sentence-fast-tts");
    vi.stubEnv("NEXT_PUBLIC_TRANSLATOR_FIRST_SENTENCE_FAST_TTS", "true");
    expect(await spikeFlag()).toBe("false");
  });

  it("does not enable other previews or local builds", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    expect(await spikeFlag()).toBe("false");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "spike/first-sentence-fast-tts");
    expect(await spikeFlag()).toBe("false");
  });

  it("preserves only a valid QA mode through app login on the spike preview", async () => {
    vi.stubEnv("NEXT_PUBLIC_TRANSLATOR_FIRST_SENTENCE_FAST_TTS", "true");
    vi.resetModules();
    const { translatorTtsQaLoginUrl, translatorTtsQaAfterLoginUrl } =
      await import("@/lib/translator/firstSentenceFastTts");
    expect(translatorTtsQaLoginUrl("?ttsMode=segmented"))
      .toBe("/login?ttsMode=segmented");
    expect(translatorTtsQaAfterLoginUrl("?ttsMode=segmented"))
      .toBe("/translator?ttsMode=segmented");
    expect(translatorTtsQaLoginUrl("?ttsMode=legacy"))
      .toBe("/login?ttsMode=legacy");
    expect(translatorTtsQaAfterLoginUrl("?ttsMode=legacy"))
      .toBe("/translator?ttsMode=legacy");
    expect(translatorTtsQaLoginUrl("?ttsMode=invalid"))
      .toBe("/login");
    expect(translatorTtsQaAfterLoginUrl("?ttsMode=invalid"))
      .toBe("/");
    expect(translatorTtsQaLoginUrl("")).toBe("/login");
    expect(translatorTtsQaAfterLoginUrl("")).toBe("/");
  });

  it("does not alter login redirects when the spike flag is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_TRANSLATOR_FIRST_SENTENCE_FAST_TTS", "false");
    vi.resetModules();
    const { translatorTtsQaLoginUrl, translatorTtsQaAfterLoginUrl } =
      await import("@/lib/translator/firstSentenceFastTts");
    expect(translatorTtsQaLoginUrl("?ttsMode=legacy"))
      .toBe("/login");
    expect(translatorTtsQaAfterLoginUrl("?ttsMode=legacy"))
      .toBe("/");
  });
});
