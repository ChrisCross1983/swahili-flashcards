import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import NominalClassesIntroClient from "./NominalClassesIntroClient";

export default async function NominalClassesIntroPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <NominalClassesIntroClient ownerKey={user.id} />;
}