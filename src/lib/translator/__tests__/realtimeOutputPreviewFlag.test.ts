import { afterEach, describe, expect, it, vi } from "vitest";
import { classicRealtime21OutputFlagForBuild } from "@/lib/translator/realtimeOutputPreviewFlag";
import { isClassicRealtimeEnabledForUserAgent } from "@/lib/translator/capturePolicy";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Classic Realtime 2.1 output build gate", () => {
  const iphone = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile Safari/604.1";

  it("enables the intended Preview branch while retaining iPhone upload transcription", () => {
    expect(classicRealtime21OutputFlagForBuild({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "spike/realtime-21-output",
    })).toBe("true");
    expect(isClassicRealtimeEnabledForUserAgent(iphone)).toBe(false);
  });

  it.each([
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: undefined },
    { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "spike/realtime-21-output" },
    { VERCEL_ENV: "development", VERCEL_GIT_COMMIT_REF: "spike/realtime-21-output" },
  ])("keeps other Vercel builds on legacy output: %j", (deployment) => {
    expect(classicRealtime21OutputFlagForBuild({
      NODE_ENV: "production",
      NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED: "true",
      ...deployment,
    })).toBe("false");
  });

  it("fails closed when deployment metadata is missing from a production build", () => {
    expect(classicRealtime21OutputFlagForBuild({
      NODE_ENV: "production",
      NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED: "true",
    })).toBe("false");
  });

  it("still allows a deliberate local development probe", () => {
    expect(classicRealtime21OutputFlagForBuild({
      NODE_ENV: "development",
      NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED: "true",
    })).toBe("true");
  });

  it("supports Vercel's public system-variable names", () => {
    expect(classicRealtime21OutputFlagForBuild({
      NODE_ENV: "production",
      NEXT_PUBLIC_VERCEL_ENV: "preview",
      NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF: "spike/realtime-21-output",
    })).toBe("true");
  });

  it("wires the Preview branch decision into the actual Next.js client build", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "spike/realtime-21-output");
    const { default: nextConfig } = await import("../../../../next.config");
    expect(nextConfig.env?.NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED).toBe("true");
  });

  it("keeps the actual Production build on legacy speech output", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "spike/realtime-21-output");
    vi.stubEnv("NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED", "true");
    const { default: nextConfig } = await import("../../../../next.config");
    expect(nextConfig.env?.NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED).toBe("false");
  });
});
