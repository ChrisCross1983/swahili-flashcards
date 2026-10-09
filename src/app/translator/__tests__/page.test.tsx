import { afterEach, describe, expect, it, vi } from "vitest";

const { redirectMock, getUserMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth: { getUser: getUserMock } }),
}));
vi.mock("@/components/translator/TranslatorView", () => ({
  default: () => null,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("Classic translator QA login return", () => {
  it("keeps a valid preview TTS mode across the auth redirect", async () => {
    vi.stubEnv("NEXT_PUBLIC_TRANSLATOR_FIRST_SENTENCE_FAST_TTS", "true");
    redirectMock.mockImplementation(() => { throw new Error("redirected"); });
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { default: TranslatorPage } = await import("@/app/translator/page");
    await expect(TranslatorPage({ searchParams: Promise.resolve({ ttsMode: "legacy" }) }))
      .rejects.toThrow("redirected");
    expect(redirectMock).toHaveBeenCalledWith("/login?ttsMode=legacy");
  });

  it("leaves default and non-preview auth redirects unchanged", async () => {
    vi.stubEnv("NEXT_PUBLIC_TRANSLATOR_FIRST_SENTENCE_FAST_TTS", "false");
    redirectMock.mockImplementation(() => { throw new Error("redirected"); });
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { default: TranslatorPage } = await import("@/app/translator/page");
    await expect(TranslatorPage({ searchParams: Promise.resolve({ ttsMode: "legacy" }) }))
      .rejects.toThrow("redirected");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
