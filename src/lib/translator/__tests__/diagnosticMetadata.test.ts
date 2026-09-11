import { describe, expect, it } from "vitest";
import { getTranslatorBuildMetadata } from "@/lib/translator/diagnosticMetadata";
import nextConfig from "../../../../next.config";
import packageJson from "../../../../package.json";

describe("translator build metadata", () => {
  it("truthfully separates a localhost frontend from an explicitly production backend", () => {
    expect(getTranslatorBuildMetadata({
      hostname: "localhost",
      nodeEnvironment: "development",
      vercelEnvironment: null,
      backendEnvironmentLabel: "production",
      buildVersion: "local",
    })).toMatchObject({
      frontendRuntimeEnvironment: "development",
      frontendOriginKind: "localhost",
      backendEnvironmentLabel: "production",
      buildVersion: "local",
    });
  });

  it("classifies Vercel preview and production origins with concrete deployment metadata", () => {
    expect(getTranslatorBuildMetadata({
      hostname: "branch-project.vercel.app",
      vercelEnvironment: "preview",
      backendEnvironmentLabel: "staging",
      deploymentId: "dpl_preview",
      gitCommitSha: "abc123",
    })).toMatchObject({
      frontendRuntimeEnvironment: "preview",
      frontendOriginKind: "vercel_preview",
      deploymentId: "dpl_preview",
      gitCommitSha: "abc123",
    });
    expect(getTranslatorBuildMetadata({
      hostname: "app.example.com",
      vercelEnvironment: "production",
      backendEnvironmentLabel: "production",
      deploymentId: "dpl_prod",
      gitCommitSha: "def456",
    })).toMatchObject({
      frontendRuntimeEnvironment: "production",
      frontendOriginKind: "custom_domain",
      backendEnvironmentLabel: "production",
    });
  });

  it("injects the package version instead of a development label", () => {
    expect(nextConfig.env?.NEXT_PUBLIC_APP_VERSION).toBe(
      process.env.NEXT_PUBLIC_APP_VERSION ?? packageJson.version,
    );
    expect(nextConfig.env?.NEXT_PUBLIC_APP_VERSION).not.toBe("development");
  });
});
