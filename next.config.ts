import type { NextConfig } from "next";
import packageJson from "./package.json";
import { classicRealtime21OutputFlagForBuild } from "./src/lib/translator/realtimeOutputPreviewFlag";

const nextConfig: NextConfig = {
  // Only non-secret deployment metadata is copied into the client build. This
  // keeps translator reports truthful without exposing service credentials.
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION ?? packageJson.version,
    NEXT_PUBLIC_VERCEL_ENV:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID:
      process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID ??
      process.env.VERCEL_DEPLOYMENT_ID,
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA,
    // Only this branch's Preview build opts into the Classic speech-output spike.
    NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED:
      classicRealtime21OutputFlagForBuild(process.env),
  },
};

export default nextConfig;
