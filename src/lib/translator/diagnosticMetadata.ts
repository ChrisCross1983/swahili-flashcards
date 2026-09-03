export type TranslatorBuildMetadata = {
  appVersion: string;
  buildVersion: string;
  gitCommitSha: string | null;
  environment: "development" | "preview" | "production";
};

export type TranslatorPlatformMetadata = {
  platform: "web";
  browserFamily: string;
  browserVersion: string | null;
  osFamily: string;
};

export function getTranslatorBuildMetadata(): TranslatorBuildMetadata {
  const environment = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
    ? "preview"
    : process.env.NODE_ENV === "production"
      ? "production"
      : "development";
  return {
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "development",
    buildVersion:
      process.env.NEXT_PUBLIC_BUILD_VERSION ??
      process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID ??
      "local",
    gitCommitSha:
      process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
      null,
    environment,
  };
}

export function detectTranslatorPlatform(userAgent: string): TranslatorPlatformMetadata {
  const browser = userAgent.match(/Edg\/([\d.]+)/)
    ?? userAgent.match(/CriOS\/([\d.]+)/)
    ?? userAgent.match(/Chrome\/([\d.]+)/)
    ?? userAgent.match(/FxiOS\/([\d.]+)/)
    ?? userAgent.match(/Firefox\/([\d.]+)/)
    ?? userAgent.match(/Version\/([\d.]+).*Safari/);
  const browserFamily = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("CriOS/") || userAgent.includes("Chrome/")
      ? "Chrome"
      : userAgent.includes("FxiOS/") || userAgent.includes("Firefox/")
        ? "Firefox"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Other";
  const osFamily = /iPhone|iPad|iPod/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Other";
  return {
    platform: "web",
    browserFamily,
    browserVersion: browser?.[1] ?? null,
    osFamily,
  };
}

