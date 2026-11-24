import { redirect } from "next/navigation";
import { getRequestUser } from "@/lib/auth/requestUser";
import { ServerPerformanceAudit } from "@/lib/server/performanceAudit";
import { getTrainerSetupCountsForUser } from "@/lib/server/trainerSetupCounts";
import type { SetupCounts } from "@/lib/trainer/types";
import TrainerClient from "./TrainerClient";

export default async function TrainerPage() {
  const audit = new ServerPerformanceAudit("/trainer");
  const { data: { user } } = await audit.measure("auth_user", getRequestUser);

  if (!user) {
    audit.log();
    redirect("/login");
  }

  let initialSetupCounts: SetupCounts | null = null;
  let initialSetupCountsState: "ready" | "error" = "error";
  try {
    initialSetupCounts = await audit.measure("setup_counts_rpc", () => getTrainerSetupCountsForUser(user.id, "vocab"));
    initialSetupCountsState = "ready";
  } catch {
    // Preserve the existing retry UI without issuing an initial client-side
    // API request (and therefore without a second authentication roundtrip).
  }

  audit.log();
  return <TrainerClient
    ownerKey={user.id}
    userEmail={user.email ?? null}
    initialSetupCounts={initialSetupCounts}
    initialSetupCountsState={initialSetupCountsState}
  />;
}
