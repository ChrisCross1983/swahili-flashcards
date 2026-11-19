import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import HomeClient from "./HomeClient";
import { checkAdminMembership } from "@/lib/admin/requireAdmin";

export default async function HomePage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const membership = await checkAdminMembership(user.id).catch(() => ({ enabled: false, error: true }));
  return <HomeClient ownerKey={user.id} isAdmin={membership.enabled} />;
}
