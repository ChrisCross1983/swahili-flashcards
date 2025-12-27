import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import PathClient from "./PathClient";

export default async function PathPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <PathClient />;
}
