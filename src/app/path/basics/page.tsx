import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import BasicsClient from "./BasicsClient";

export default async function BasicsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <BasicsClient ownerKey={user.id} />;
}
