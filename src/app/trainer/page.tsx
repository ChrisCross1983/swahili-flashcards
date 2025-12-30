import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import TrainerClient from "./TrainerClient";

export default async function TrainerPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <TrainerClient ownerKey={user.id} />;
}
