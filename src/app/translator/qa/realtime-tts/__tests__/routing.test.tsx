import { afterEach, describe, expect, it, vi } from "vitest";

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth: { getUser: getUserMock } }),
}));

import RealtimeTtsQaPage from "../page";
import TranslatorPage from "@/app/translator/page";
import RealtimeTtsQaView from "@/components/translator/qa/RealtimeTtsQaView";
import TranslatorView from "@/components/translator/TranslatorView";
import {
  REALTIME_TTS_QA_PATH,
  realtimeTtsQaLoginUrl,
  realtimeTtsQaReturnAfterLogin,
} from "@/lib/translator/realtimeTtsQa";

afterEach(() => { vi.unstubAllEnvs(); getUserMock.mockReset(); });

describe("realtime TTS QA routing", () => {
  it("renders only the QA page for an authenticated preview user", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "perf/translator-region-fra1-test");
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const view = await RealtimeTtsQaPage();
    expect(view.type).toBe(RealtimeTtsQaView);
    expect(view.type).not.toBe(TranslatorView);
  });

  it("preserves the exact QA destination across login only in preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "perf/translator-region-fra1-test");
    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(RealtimeTtsQaPage()).rejects.toThrow(`redirect:${realtimeTtsQaLoginUrl()}`);
    vi.stubEnv("NEXT_PUBLIC_REALTIME_TTS_QA_PREVIEW_ENABLED", "true");
    expect(realtimeTtsQaReturnAfterLogin(`?next=${encodeURIComponent(REALTIME_TTS_QA_PATH)}`)).toBe(REALTIME_TTS_QA_PATH);
    expect(realtimeTtsQaReturnAfterLogin(`?next=${encodeURIComponent(REALTIME_TTS_QA_PATH)}`, true)).toBe(REALTIME_TTS_QA_PATH);
    expect(realtimeTtsQaReturnAfterLogin(`?next=${encodeURIComponent(REALTIME_TTS_QA_PATH)}`, false)).toBeNull();
    expect(realtimeTtsQaReturnAfterLogin("?next=https://example.com", true)).toBeNull();
  });

  it("keeps normal /translator on TranslatorView", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const view = await TranslatorPage({ searchParams: Promise.resolve({}) });
    expect(view.type).toBe(TranslatorView);
  });

  it("returns 404 for the QA page in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    await expect(RealtimeTtsQaPage()).rejects.toThrow("notFound");
    expect(getUserMock).not.toHaveBeenCalled();
  });
});
