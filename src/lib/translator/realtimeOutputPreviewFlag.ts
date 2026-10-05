const REALTIME_OUTPUT_SPIKE_BRANCH = "spike/realtime-21-output";

type BuildEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  | "VERCEL_ENV"
  | "NEXT_PUBLIC_VERCEL_ENV"
  | "VERCEL_GIT_COMMIT_REF"
  | "NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF"
  | "NODE_ENV"
  | "NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED"
>>;

/** Resolve the public speech-output flag at build time; all Vercel targets fail closed. */
export function classicRealtime21OutputFlagForBuild(env: BuildEnvironment): "true" | "false" {
  const deploymentEnvironment = env.VERCEL_ENV || env.NEXT_PUBLIC_VERCEL_ENV;
  const branch = env.VERCEL_GIT_COMMIT_REF || env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF;

  if (deploymentEnvironment === "preview") {
    return branch === REALTIME_OUTPUT_SPIKE_BRANCH ? "true" : "false";
  }
  if (deploymentEnvironment || env.NODE_ENV !== "development") {
    return "false";
  }
  return env.NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED === "true"
    ? "true"
    : "false";
}
