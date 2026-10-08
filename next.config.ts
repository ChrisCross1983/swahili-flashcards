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
    // The experiment cannot be enabled on main or a production deployment,
    // even if a project-wide environment variable is set accidentally.
    NEXT_PUBLIC_TRANSLATOR_FIRST_SENTENCE_FAST_TTS:
      process.env.VERCEL_ENV === "preview" &&
      process.env.VERCEL_GIT_COMMIT_REF === "spike/first-sentence-fast-tts"
        ? "true"
        : "false",
  },
};

export default nextConfig;
