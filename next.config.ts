import type { NextConfig } from "next";
import packageJson from "./package.json";

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
  },
};

export default nextConfig;
