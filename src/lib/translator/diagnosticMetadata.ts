export type TranslatorRuntimeEnvironment =
  | "development"
  | "preview"
  | "production"
  | "unknown";

export type TranslatorFrontendOriginKind =
  | "localhost"
  | "vercel_preview"
  | "vercel_production"
  | "custom_domain"
  | "unknown";

export type TranslatorBuildMetadata = {
  appVersion: string;
  buildVersion: string;
  gitCommitSha: string | null;
  deploymentId: string | null;
  vercelEnvironment: "development" | "preview" | "production" | null;
  frontendRuntimeEnvironment: TranslatorRuntimeEnvironment;
  frontendOriginKind: TranslatorFrontendOriginKind;
  backendEnvironmentLabel: "development" | "staging" | "production" | "unknown";
  /** V5 compatibility alias. Source of truth is frontendRuntimeEnvironment. */
  environment: "development" | "preview" | "production";
};

export type TranslatorPlatformMetadata = {
  platform: "web";
  browserFamily: string;
  browserVersion: string | null;
  osFamily: string;
};

type MetadataOverrides = {
  hostname?: string | null;
  nodeEnvironment?: string;
  vercelEnvironment?: string | null;
  backendEnvironmentLabel?: string | null;
  appVersion?: string | null;
  buildVersion?: string | null;
  deploymentId?: string | null;
  gitCommitSha?: string | null;
};

function runtimeEnvironment(value: string | null | undefined): TranslatorRuntimeEnvironment {
  return value === "development" || value === "preview" || value === "production"
    ? value
    : "unknown";
}

function backendLabel(value: string | null | undefined) {
  return value === "development" || value === "staging" || value === "production"
    ? value
    : "unknown" as const;
}

export function getTranslatorBuildMetadata(
  overrides: MetadataOverrides = {},
): TranslatorBuildMetadata {
  const hostname = overrides.hostname ??
    (typeof window === "undefined" ? null : window.location.hostname);
  const vercel = runtimeEnvironment(
    overrides.vercelEnvironment ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? null,
  );
  const localhost = hostname === "localhost" || hostname === "127.0.0.1" ||
    hostname === "[::1]";
  const configuredRuntime = runtimeEnvironment(
    process.env.NEXT_PUBLIC_FRONTEND_RUNTIME_ENVIRONMENT,
  );
  const frontendRuntimeEnvironment: TranslatorRuntimeEnvironment = localhost
    ? "development"
    : configuredRuntime !== "unknown"
      ? configuredRuntime
      : vercel !== "unknown"
        ? vercel
        : runtimeEnvironment(overrides.nodeEnvironment ?? process.env.NODE_ENV);
  const frontendOriginKind: TranslatorFrontendOriginKind = localhost
    ? "localhost"
    : vercel === "preview"
      ? "vercel_preview"
      : vercel === "production"
        ? hostname?.endsWith(".vercel.app")
          ? "vercel_production"
          : hostname
            ? "custom_domain"
            : "unknown"
        : hostname
          ? "custom_domain"
          : "unknown";
  const deploymentId = overrides.deploymentId ??
    process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID ?? null;
  return {
    appVersion: overrides.appVersion ?? process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    buildVersion: overrides.buildVersion ?? process.env.NEXT_PUBLIC_BUILD_VERSION ??
      deploymentId ?? "local",
    gitCommitSha: overrides.gitCommitSha ?? process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? null,
    deploymentId,
    vercelEnvironment: vercel === "unknown" ? null : vercel,
    frontendRuntimeEnvironment,
    frontendOriginKind,
    backendEnvironmentLabel: backendLabel(
      overrides.backendEnvironmentLabel ??
      process.env.NEXT_PUBLIC_BACKEND_ENVIRONMENT_LABEL,
    ),
    environment: frontendRuntimeEnvironment === "preview" ||
      frontendRuntimeEnvironment === "production"
      ? frontendRuntimeEnvironment
      : "development",
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
  return { platform: "web", browserFamily, browserVersion: browser?.[1] ?? null, osFamily };
}
