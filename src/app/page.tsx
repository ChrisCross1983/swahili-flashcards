import { redirect } from "next/navigation";
import { getRequestUser } from "@/lib/auth/requestUser";
import HomeClient from "./HomeClient";
import { checkAdminMembership } from "@/lib/admin/requireAdmin";
import { ServerPerformanceAudit } from "@/lib/server/performanceAudit";

export default async function HomePage() {
  const audit = new ServerPerformanceAudit("/");
  const { data: { user } } = await audit.measure("auth_user", getRequestUser);

  if (!user) {
    audit.log();
    redirect("/login");
  }

  const membership = await audit.measure("admin_membership", () => checkAdminMembership(user.id).catch(() => ({ enabled: false, error: true })));
  audit.log();
  return <HomeClient ownerKey={user.id} isAdmin={membership.enabled} />;
}
