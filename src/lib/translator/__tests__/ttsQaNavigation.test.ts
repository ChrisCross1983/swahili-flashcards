import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("translator QA mode navigation", () => {
  it("preserves legacy mode through unauthenticated preview redirects", async () => {
    vi.stubEnv("NEXT_PUBLIC_TRANSLATOR_TTS_QA_ENABLED", "true");
    const { default: HomePage } = await import("@/app/page");
    const { default: TranslatorPage } = await import("@/app/translator/page");
    const searchParams = Promise.resolve({ ttsMode: "legacy" });
    await expect(HomePage({ searchParams })).rejects.toThrow("redirect:/login?ttsMode=legacy");
    await expect(TranslatorPage({ searchParams })).rejects.toThrow("redirect:/login?ttsMode=legacy");
  });

  it("keeps production redirects unchanged when preview QA is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_TRANSLATOR_TTS_QA_ENABLED", "false");
    const { default: HomePage } = await import("@/app/page");
    const { default: TranslatorPage } = await import("@/app/translator/page");
    const searchParams = Promise.resolve({ ttsMode: "legacy" });
    await expect(HomePage({ searchParams })).rejects.toThrow("redirect:/login");
    await expect(TranslatorPage({ searchParams })).rejects.toThrow("redirect:/login");
  });
});
